import type { CaptureEvent, Deps, Env } from "./env";
import { toMetadata } from "./metadata";

export const forwardEnabled = (env: Env): boolean => env.SGTM_FORWARD === "on" && !!env.SGTM_ENDPOINT;

export function sgtmUrl(env: Env): string {
  return new URL(env.SGTM_PATH || "/agent-events", env.SGTM_ENDPOINT).toString();
}

/**
 * One HTTP POST per milestone event, metadata only (openai-standards: a relay you own assembles
 * milestones and sends ordinary hits; sGTM has no stream client). Every event gets a `forwards`
 * row, including `skipped` while the relay is off (ADR 0002). Never throws.
 */
export async function forwardEvents(env: Env, deps: Deps, events: CaptureEvent[]): Promise<void> {
  const enabled = forwardEnabled(env);
  const rows: { id: string; status: string; http: number | null; attempts: number }[] = [];
  if (!enabled) {
    for (const e of events) rows.push({ id: e.event_id, status: "skipped", http: null, attempts: 0 });
  } else {
    const url = sgtmUrl(env);
    const outcomes = await Promise.allSettled(
      events.map((e) =>
        deps.fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-synter-loop-schema": e.schema },
          body: JSON.stringify(toMetadata(e)),
          signal: AbortSignal.timeout(5000),
        }),
      ),
    );
    outcomes.forEach((o, i) => {
      const id = events[i]!.event_id;
      if (o.status === "fulfilled") rows.push({ id, status: o.value.ok ? "sent" : "failed", http: o.value.status, attempts: 1 });
      else rows.push({ id, status: "failed", http: null, attempts: 1 });
    });
  }
  const now = deps.now().toISOString();
  try {
    await env.DB.batch(
      rows.map((r) =>
        env.DB.prepare(
          `INSERT INTO forwards (event_id, status, http_status, attempts, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT (event_id) DO UPDATE SET status = excluded.status, http_status = excluded.http_status,
             attempts = forwards.attempts + excluded.attempts, updated_at = excluded.updated_at`,
        ).bind(r.id, r.status, r.http, r.attempts, now),
      ),
    );
  } catch (err) {
    console.error("forwards bookkeeping failed", (err as Error).message);
  }
}
