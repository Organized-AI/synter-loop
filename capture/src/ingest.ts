import { Validator } from "@cfworker/json-schema";
import schema from "../../schema/events.v1.json";
import type { CaptureEvent, Deps, Env } from "./env";
import { toMetadata } from "./metadata";
import { forwardEvents } from "./sgtm";

const validator = new Validator(schema as any, "2020-12", true);

export const SESSION_TURN = "_session";

export type ParseResult = { ok: true; events: unknown[] } | { ok: false; error: string };

/** Accepts {"events": [...]}, a bare JSON array, one event object, or JSONL. */
export function parseBody(text: string, contentType: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "empty body" };
  const ndjson = /ndjson|jsonl|jsonlines/i.test(contentType);
  if (!ndjson) {
    try {
      const v = JSON.parse(trimmed);
      if (Array.isArray(v)) return { ok: true, events: v };
      if (v && typeof v === "object" && Array.isArray((v as any).events)) return { ok: true, events: (v as any).events };
      if (v && typeof v === "object") return { ok: true, events: [v] };
      return { ok: false, error: "body must be an event, an array of events, or {\"events\": [...]}" };
    } catch {
      if (!trimmed.includes("\n")) return { ok: false, error: "invalid JSON" };
    }
  }
  const events: unknown[] = [];
  const lines = trimmed.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      return { ok: false, error: `invalid JSON on line ${i + 1}` };
    }
  }
  return { ok: true, events };
}

export interface SchemaFailure {
  index: number;
  errors: { path: string; keyword: string; error: string }[];
}

export function validateEvents(events: unknown[]): SchemaFailure | null {
  for (let i = 0; i < events.length; i++) {
    const r = validator.validate(events[i]);
    if (!r.valid) {
      return {
        index: i,
        errors: r.errors.slice(0, 5).map((e) => ({ path: e.instanceLocation, keyword: e.keyword, error: e.error })),
      };
    }
  }
  return null;
}

export const turnKeyOf = (e: CaptureEvent): string => e.turn_id ?? SESSION_TURN;
export const r2KeyOf = (runId: string, turnKey: string): string => `runs/${runId}/${turnKey}.jsonl`;

function order(a: CaptureEvent, b: CaptureEvent): number {
  if (a.seq !== undefined && b.seq !== undefined && a.seq !== b.seq) return a.seq - b.seq;
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  return a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0;
}

/**
 * Merge incoming events into the turn's R2 object by event_id. Idempotent: a retried POST
 * leaves the object unchanged. Writes are conditional on the etag read, so two concurrent
 * POSTs for the same turn cannot drop each other's events.
 */
export async function mergeTurn(bucket: R2Bucket, key: string, incoming: CaptureEvent[]): Promise<CaptureEvent[]> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await bucket.get(key);
    const byId = new Map<string, CaptureEvent>();
    if (existing) {
      for (const line of new TextDecoder().decode(await existing.arrayBuffer()).split("\n")) {
        if (line.trim()) {
          const e = JSON.parse(line) as CaptureEvent;
          byId.set(e.event_id, e);
        }
      }
    }
    let added = 0;
    for (const e of incoming) {
      if (!byId.has(e.event_id)) {
        byId.set(e.event_id, e);
        added++;
      }
    }
    const merged = [...byId.values()].sort(order);
    if (existing && added === 0) return merged;
    const first = merged[0]!;
    const put = await bucket.put(key, merged.map((e) => JSON.stringify(e)).join("\n") + "\n", {
      httpMetadata: { contentType: "application/x-ndjson" },
      customMetadata: { run_id: first.run_id, turn_key: turnKeyOf(first), events: String(merged.length) },
      ...(existing ? { onlyIf: { etagMatches: existing.etag } } : {}),
    });
    if (put) return merged;
  }
  throw new Error(`R2 write conflict on ${key}`);
}

export interface TurnSummary {
  event_count: number;
  first_ts: string;
  last_ts: string;
  status: string | null;
  tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_tokens: number;
  reasoning_tokens: number;
  cost_usd: number;
}

const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Recomputed from the full merged turn, so it is exact however many times a turn is posted. */
export function summarizeTurn(events: CaptureEvent[]): TurnSummary {
  const s: TurnSummary = {
    event_count: events.length, first_ts: events[0]!.ts, last_ts: events[0]!.ts, status: null, tool_calls: 0,
    input_tokens: 0, output_tokens: 0, cache_tokens: 0, reasoning_tokens: 0, cost_usd: 0,
  };
  for (const e of events) {
    if (e.ts < s.first_ts) s.first_ts = e.ts;
    if (e.ts > s.last_ts) s.last_ts = e.ts;
    if (e.event === "agent_tool_call") s.tool_calls++;
    if (e.event === "agent_turn_complete" && typeof e.data.status === "string") s.status = e.data.status;
    if (e.event === "agent_model_call") {
      const u = e.data.usage ?? {};
      s.input_tokens += int(u.input_tokens);
      s.output_tokens += int(u.output_tokens);
      s.cache_tokens += int(u.cache_read_tokens) + int(u.cache_write_tokens);
      s.reasoning_tokens += int(u.reasoning_tokens);
      s.cost_usd += num(e.data.cost_usd);
    }
  }
  s.cost_usd = Math.round(s.cost_usd * 1e6) / 1e6;
  return s;
}

export interface IngestResult {
  accepted: number;
  duplicates: number;
  turns: { run_id: string; turn_key: string; r2_key: string; event_count: number }[];
}

export async function ingest(env: Env, ctx: ExecutionContext, deps: Deps, raw: CaptureEvent[]): Promise<IngestResult> {
  // Drop repeats inside one batch; keep the first.
  const seen = new Set<string>();
  const events = raw.filter((e) => (seen.has(e.event_id) ? false : (seen.add(e.event_id), true)));

  const groups = new Map<string, CaptureEvent[]>();
  for (const e of events) {
    const key = r2KeyOf(e.run_id, turnKeyOf(e));
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }

  // 1. R2 first. Idempotent, so a failure after this point is fixed by the client's retry.
  const now = deps.now().toISOString();
  const stmts: D1PreparedStatement[] = [];
  const turns: IngestResult["turns"] = [];
  const runs = new Map<string, CaptureEvent>();
  for (const [key, incoming] of groups) {
    const merged = await mergeTurn(env.RUNS, key, incoming);
    const s = summarizeTurn(merged);
    const first = incoming[0]!;
    const turnKey = turnKeyOf(first);
    turns.push({ run_id: first.run_id, turn_key: turnKey, r2_key: key, event_count: s.event_count });
    stmts.push(
      env.DB.prepare(
        `INSERT INTO turns (run_id, turn_key, r2_key, event_count, first_ts, last_ts, status, tool_calls,
           input_tokens, output_tokens, cache_tokens, reasoning_tokens, cost_usd, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
         ON CONFLICT (run_id, turn_key) DO UPDATE SET
           r2_key = excluded.r2_key, event_count = excluded.event_count, first_ts = excluded.first_ts,
           last_ts = excluded.last_ts, status = excluded.status, tool_calls = excluded.tool_calls,
           input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
           cache_tokens = excluded.cache_tokens, reasoning_tokens = excluded.reasoning_tokens,
           cost_usd = excluded.cost_usd, updated_at = excluded.updated_at`,
      ).bind(first.run_id, turnKey, key, s.event_count, s.first_ts, s.last_ts, s.status, s.tool_calls,
        s.input_tokens, s.output_tokens, s.cache_tokens, s.reasoning_tokens, s.cost_usd, now),
    );
    for (const e of incoming) {
      const prev = runs.get(e.run_id);
      if (!prev || e.ts >= prev.ts) runs.set(e.run_id, e);
    }
  }

  // 2. Runs are rebuilt from their turn rows (same transaction, after the turn upserts).
  for (const [runId, latest] of runs) {
    const model = (latest.data.model as string | undefined) ?? latest.harness_variant.model ?? null;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO runs (run_id, session_id, variant_id, variant_label, model, first_ts, last_ts, turn_count,
           event_count, tool_calls, input_tokens, output_tokens, cache_tokens, reasoning_tokens, cost_usd, updated_at)
         SELECT ?1, ?2, ?3, ?4, ?5, MIN(first_ts), MAX(last_ts), SUM(turn_key != '_session'), SUM(event_count),
           SUM(tool_calls), SUM(input_tokens), SUM(output_tokens), SUM(cache_tokens), SUM(reasoning_tokens),
           ROUND(SUM(cost_usd), 6), ?6
         FROM turns WHERE run_id = ?1
         ON CONFLICT (run_id) DO UPDATE SET
           session_id = excluded.session_id, variant_id = excluded.variant_id, variant_label = excluded.variant_label,
           model = COALESCE(excluded.model, runs.model), first_ts = excluded.first_ts, last_ts = excluded.last_ts,
           turn_count = excluded.turn_count, event_count = excluded.event_count, tool_calls = excluded.tool_calls,
           input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
           cache_tokens = excluded.cache_tokens, reasoning_tokens = excluded.reasoning_tokens,
           cost_usd = excluded.cost_usd, updated_at = excluded.updated_at`,
      ).bind(runId, latest.session_id, latest.harness_variant.id, latest.harness_variant.label ?? null, model, now),
    );
  }

  // 3. Feed rows: the unique event_id makes these the duplicate detector.
  const feedStart = stmts.length;
  for (const e of events) {
    stmts.push(
      env.DB.prepare(
        "INSERT OR IGNORE INTO feed (event_id, run_id, turn_key, event, ts, meta) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      ).bind(e.event_id, e.run_id, turnKeyOf(e), e.event, e.ts, JSON.stringify(toMetadata(e))),
    );
  }
  const results = await env.DB.batch(stmts);
  const fresh = events.filter((_, i) => (results[feedStart + i]?.meta.changes ?? 0) > 0);

  // 4. sGTM relay for new events only, after the response is on its way.
  if (fresh.length) ctx.waitUntil(forwardEvents(env, deps, fresh));

  return { accepted: fresh.length, duplicates: raw.length - fresh.length, turns };
}
