import type { Env } from "./env";
import { intParam, json } from "./http";

interface FeedRow { seq: number; meta: string }

async function after(env: Env, cursor: number, limit: number, runId: string | null): Promise<FeedRow[]> {
  const q = runId
    ? env.DB.prepare("SELECT seq, meta FROM feed WHERE seq > ?1 AND run_id = ?2 ORDER BY seq LIMIT ?3").bind(cursor, runId, limit)
    : env.DB.prepare("SELECT seq, meta FROM feed WHERE seq > ?1 ORDER BY seq LIMIT ?2").bind(cursor, limit);
  return (await q.all<FeedRow>()).results;
}

async function maxSeq(env: Env): Promise<number> {
  return (await env.DB.prepare("SELECT COALESCE(MAX(seq), 0) AS m FROM feed").first<number>("m")) ?? 0;
}

/** `cursor` is the feed position; the event's own `seq` (emission order) is left untouched. */
const shape = (r: FeedRow) => ({ ...JSON.parse(r.meta), cursor: r.seq });

/** GET /v1/feed?after=<seq>&limit=&run_id=   or   ?tail=<n> for the newest n. */
export async function feedJson(env: Env, url: URL): Promise<Response> {
  const limit = intParam(url.searchParams.get("limit"), 100, 1, 500);
  const runId = url.searchParams.get("run_id");
  let cursor = intParam(url.searchParams.get("after"), 0, 0, Number.MAX_SAFE_INTEGER);
  if (url.searchParams.has("tail")) cursor = Math.max(0, (await maxSeq(env)) - intParam(url.searchParams.get("tail"), 50, 1, 500));
  const rows = await after(env, cursor, limit, runId);
  return json({ events: rows.map(shape), next: rows.length ? rows[rows.length - 1]!.seq : cursor });
}

/**
 * GET /v1/feed/stream: SSE (WHATWG). Resumes from Last-Event-ID or ?after; otherwise starts
 * with the newest 50. Polls D1 and closes after duration_ms; EventSource reconnects with the
 * last id, so nothing is skipped.
 */
export function feedStream(env: Env, url: URL, req: Request, ctx: ExecutionContext): Response {
  const lastId = req.headers.get("last-event-id") ?? url.searchParams.get("after");
  const durationMs = intParam(url.searchParams.get("duration_ms"), 50_000, 0, 55_000);
  const pollMs = intParam(url.searchParams.get("poll_ms"), 2_000, 50, 10_000);
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const pump = (async () => {
    try {
      let cursor = lastId !== null ? intParam(lastId, 0, 0, Number.MAX_SAFE_INTEGER) : Math.max(0, (await maxSeq(env)) - 50);
      await writer.write(enc.encode(`retry: 2000\n: synter-loop feed from ${cursor}\n\n`));
      const end = Date.now() + durationMs;
      do {
        const rows = await after(env, cursor, 200, null);
        for (const r of rows) {
          await writer.write(enc.encode(`id: ${r.seq}\nevent: agent_event\ndata: ${JSON.stringify(shape(r))}\n\n`));
          cursor = r.seq;
        }
        if (!rows.length) await writer.write(enc.encode(": keepalive\n\n"));
        if (Date.now() + pollMs > end) break;
        await new Promise((res) => setTimeout(res, pollMs));
      } while (Date.now() < end);
    } catch {
      // Client went away or D1 hiccup: close; EventSource reconnects from the last id.
    } finally {
      await writer.close().catch(() => {});
    }
  })();
  ctx.waitUntil(pump);
  return new Response(readable, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}

export async function listRuns(env: Env, url: URL): Promise<Response> {
  const limit = intParam(url.searchParams.get("limit"), 20, 1, 100);
  const { results } = await env.DB.prepare("SELECT * FROM runs ORDER BY last_ts DESC LIMIT ?1").bind(limit).all();
  return json({ runs: results });
}

export async function getRun(env: Env, runId: string): Promise<Response> {
  const run = await env.DB.prepare("SELECT * FROM runs WHERE run_id = ?1").bind(runId).first();
  if (!run) return json({ error: "run not found" }, 404);
  const { results } = await env.DB.prepare(
    "SELECT turn_key, r2_key, event_count, first_ts, last_ts, status, tool_calls, input_tokens, output_tokens, cache_tokens, reasoning_tokens, cost_usd FROM turns WHERE run_id = ?1 ORDER BY first_ts",
  ).bind(runId).all();
  return json({ run, turns: results });
}
