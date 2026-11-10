function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/live") {
      if (!env.CAPTURE_FEED_URL) return json({ ok: false, error: "CAPTURE_FEED_URL is not configured" }, 503);
      try {
        const feed = new URL(env.CAPTURE_FEED_URL);
        if (feed.protocol !== "https:" && !(env.ALLOW_INSECURE_LOCAL_FEED === "true" && feed.protocol === "http:" && feed.hostname === "127.0.0.1")) return json({ ok: false, error: "capture feed must use HTTPS" }, 503);
        const upstream = await fetch(feed, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000) });
        const body = await upstream.json();
        return json(body, upstream.status);
      } catch {
        return json({ ok: false, error: "capture feed is unavailable" }, 502);
      }
    }
    if (request.method === "GET" && url.pathname === "/demo.mp4") {
      const object = await env.MEDIA?.get("synter-loop-demo.mp4");
      if (!object) return new Response("Demo video is not configured", { status: 404, headers: { "cache-control": "no-store" } });
      return new Response(object.body, { headers: { "content-type": "video/mp4", "cache-control": "public, max-age=3600", ...(object.httpMetadata || {}) } });
    }
    if (request.method === "GET" && (url.pathname === "/live" || url.pathname === "/live/")) {
      return env.ASSETS.fetch(new Request(new URL("/live/index.html", request.url), request));
    }
    if (request.method === "GET" && (url.pathname === "/harness" || url.pathname === "/harness/")) {
      return env.ASSETS.fetch(new Request(new URL("/harness/index.html", request.url), request));
    }
    if (!env.ASSETS) return json({ ok: false, error: "static assets are not configured" }, 503);
    return env.ASSETS.fetch(request);
  },
};
