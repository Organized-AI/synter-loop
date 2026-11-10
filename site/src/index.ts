export interface Env {
  ASSETS: Fetcher;
  CAPTURE: Fetcher;
  MEDIA: R2Bucket;
}

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

const LIVE_API: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^\/live\/api\/feed$/, () => "/v1/feed"],
  [/^\/live\/api\/stream$/, () => "/v1/feed/stream"],
  [/^\/live\/api\/runs$/, () => "/v1/runs"],
  [/^\/live\/api\/runs\/([A-Za-z0-9._:-]{1,200})$/, (m) => `/v1/runs/${m[1]}`],
];

const MEDIA_KEY = /^\/media\/([A-Za-z0-9._-]{1,128})$/;

function withHeaders(res: Response, extra: Record<string, string> = {}): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...extra })) out.headers.set(k, v);
  return out;
}

/** Forward only what the feed needs: never the visitor's cookies or authorization. */
async function proxyLive(req: Request, env: Env, path: string, search: string): Promise<Response> {
  const headers = new Headers({ accept: req.headers.get("accept") ?? "*/*" });
  const lastId = req.headers.get("last-event-id");
  if (lastId) headers.set("last-event-id", lastId);
  const res = await env.CAPTURE.fetch(new Request(`https://agent-capture${path}${search}`, { headers }));
  return withHeaders(res, { "cache-control": "no-store" });
}

/** R2 media with Range support, so the demo video can seek. */
async function media(req: Request, env: Env, key: string): Promise<Response> {
  if (req.method === "HEAD") {
    const head = await env.MEDIA.head(key);
    if (!head) return new Response(null, { status: 404, headers: SECURITY_HEADERS });
    const h = new Headers(SECURITY_HEADERS);
    head.writeHttpMetadata(h);
    h.set("etag", head.httpEtag);
    h.set("accept-ranges", "bytes");
    h.set("content-length", String(head.size));
    return new Response(null, { headers: h });
  }
  const obj = await env.MEDIA.get(key, { range: req.headers, onlyIf: req.headers });
  if (!obj) return new Response("not found", { status: 404, headers: SECURITY_HEADERS });
  const h = new Headers(SECURITY_HEADERS);
  obj.writeHttpMetadata(h);
  h.set("etag", obj.httpEtag);
  h.set("accept-ranges", "bytes");
  h.set("cache-control", "public, max-age=3600");
  if (!("body" in obj)) return new Response(null, { status: 304, headers: h });
  const r = obj.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (r && req.headers.has("range")) {
    const start = r.suffix !== undefined ? obj.size - r.suffix : (r.offset ?? 0);
    const length = r.suffix !== undefined ? r.suffix : (r.length ?? obj.size - start);
    h.set("content-range", `bytes ${start}-${start + length - 1}/${obj.size}`);
    h.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set("content-length", String(obj.size));
  return new Response(obj.body, { headers: h });
}

export async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("method not allowed", { status: 405, headers: { ...SECURITY_HEADERS, allow: "GET, HEAD" } });
  }
  for (const [re, target] of LIVE_API) {
    const m = re.exec(url.pathname);
    if (m) return proxyLive(req, env, target(m), url.search);
  }
  const mk = MEDIA_KEY.exec(url.pathname);
  if (mk) return media(req, env, mk[1]!);
  // Anything else that reached the Worker is not a static asset.
  return env.ASSETS.fetch(req);
}

export default { fetch: (req, env) => handle(req, env) } satisfies ExportedHandler<Env>;
