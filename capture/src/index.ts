import { defaultDeps, SCHEMA_ID, type CaptureEvent, type Deps, type Env } from "./env";
import { feedJson, feedStream, getRun, listRuns } from "./feed";
import { bearerMatches, intParam, json } from "./http";
import { ingest, parseBody, validateEvents } from "./ingest";
import { forwardEnabled } from "./sgtm";

const RUN_PATH = /^\/v1\/runs\/([A-Za-z0-9._:-]{1,200})$/;

async function postEvents(req: Request, env: Env, ctx: ExecutionContext, deps: Deps): Promise<Response> {
  if (!env.CAPTURE_TOKEN) return json({ error: "capture is not configured" }, 503);
  if (!(await bearerMatches(req, env.CAPTURE_TOKEN))) {
    return json({ error: "unauthorized" }, 401, { "www-authenticate": 'Bearer realm="agent-capture"' });
  }
  const maxBytes = intParam(env.MAX_BODY_BYTES, 1_048_576, 1024, 10_485_760);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return json({ error: `body over ${maxBytes} bytes` }, 413);
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) return json({ error: `body over ${maxBytes} bytes` }, 413);

  const parsed = parseBody(text, req.headers.get("content-type") ?? "");
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const maxEvents = intParam(env.MAX_EVENTS, 500, 1, 5000);
  if (parsed.events.length === 0) return json({ error: "no events" }, 400);
  if (parsed.events.length > maxEvents) return json({ error: `more than ${maxEvents} events` }, 413);

  const failure = validateEvents(parsed.events);
  if (failure) return json({ error: "schema validation failed", schema: SCHEMA_ID, ...failure }, 400);

  const result = await ingest(env, ctx, deps, parsed.events as CaptureEvent[]);
  return json(result, 202);
}

export async function handle(req: Request, env: Env, ctx: ExecutionContext, deps: Deps = defaultDeps): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;
  try {
    if (pathname === "/healthz" && req.method === "GET") {
      return json({ ok: true, service: "agent-capture", schema: SCHEMA_ID, sgtm_forward: forwardEnabled(env) ? "on" : "off" });
    }
    if (pathname === "/v1/events") {
      if (req.method !== "POST") return json({ error: "method not allowed" }, 405, { allow: "POST" });
      return await postEvents(req, env, ctx, deps);
    }
    const isRead = pathname === "/v1/feed" || pathname === "/v1/feed/stream" || pathname === "/v1/runs" || RUN_PATH.test(pathname);
    if (isRead) {
      if (req.method !== "GET") return json({ error: "method not allowed" }, 405, { allow: "GET" });
      if (env.FEED_PUBLIC !== "on" && !(await bearerMatches(req, env.CAPTURE_TOKEN))) return json({ error: "unauthorized" }, 401);
      if (pathname === "/v1/feed") return await feedJson(env, url);
      if (pathname === "/v1/feed/stream") return feedStream(env, url, req, ctx);
      if (pathname === "/v1/runs") return await listRuns(env, url);
      return await getRun(env, RUN_PATH.exec(pathname)![1]!);
    }
    return json({ error: "not found" }, 404);
  } catch (err) {
    // Log the failure, never the request body.
    console.error("agent-capture error", pathname, (err as Error).message);
    return json({ error: "internal error" }, 500);
  }
}

export default {
  fetch: (req, env, ctx) => handle(req, env, ctx),
} satisfies ExportedHandler<Env>;
