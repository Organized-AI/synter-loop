import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handle, type Env } from "../src/index";

const e = env as unknown as Env;
const req = (path: string, init?: RequestInit) => new Request(`https://synter-loop.test${path}`, init);

describe("/live API proxy", () => {
  it("maps each /live/api path to the capture feed and keeps the query", async () => {
    const cases: [string, string][] = [
      ["/live/api/feed?tail=50", "https://agent-capture/v1/feed?tail=50"],
      ["/live/api/stream", "https://agent-capture/v1/feed/stream"],
      ["/live/api/runs?limit=5", "https://agent-capture/v1/runs?limit=5"],
      ["/live/api/runs/run_a", "https://agent-capture/v1/runs/run_a"],
    ];
    for (const [path, target] of cases) {
      const body = await (await handle(req(path), e)).json<any>();
      expect(body.url).toBe(target);
    }
  });

  it("never forwards the visitor's credentials, but keeps Last-Event-ID", async () => {
    const res = await handle(req("/live/api/stream", { headers: { authorization: "Bearer x", cookie: "a=b", "last-event-id": "42" } }), e);
    expect(await res.json()).toMatchObject({ auth: null, cookie: null, lastEventId: "42" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses unsafe run ids and non-GET methods", async () => {
    expect((await handle(req("/live/api/runs/..%2F..%2Fx"), e)).status).toBe(404);
    expect((await handle(req("/live/api/feed", { method: "POST" }), e)).status).toBe(405);
  });
});

describe("/media", () => {
  it("404s until the demo video is uploaded", async () => {
    expect((await handle(req("/media/demo.mp4"), e)).status).toBe(404);
    expect((await handle(req("/media/demo.mp4", { method: "HEAD" }), e)).status).toBe(404);
  });

  it("serves byte ranges so the video can seek", async () => {
    await e.MEDIA.put("clip.mp4", new Uint8Array(1000).map((_, i) => i % 256), { httpMetadata: { contentType: "video/mp4" } });
    const full = await handle(req("/media/clip.mp4"), e);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("video/mp4");
    expect((await full.arrayBuffer()).byteLength).toBe(1000);

    const part = await handle(req("/media/clip.mp4", { headers: { range: "bytes=100-199" } }), e);
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 100-199/1000");
    const bytes = new Uint8Array(await part.arrayBuffer());
    expect(bytes.length).toBe(100);
    expect(bytes[0]).toBe(100);
  });
});
