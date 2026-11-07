import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { Deps, Env } from "../src/env";
import { handle } from "../src/index";
import { toMetadata } from "../src/metadata";
import { SECRET_PROMPT, SECRET_RESULT, TOKEN, sampleRun } from "./fixtures";

type Sent = { url: string; body: string };

function deps(sent: Sent[] = [], status = 200): Deps {
  return {
    now: () => new Date("2026-11-07T12:30:00Z"),
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ url: String(input), body: String(init?.body ?? "") });
      return new Response("", { status });
    }) as typeof fetch,
  };
}

async function call(req: Request, e: Env = env, d: Deps = deps()) {
  const ctx = createExecutionContext();
  const res = await handle(req, e, ctx, d);
  await waitOnExecutionContext(ctx);
  return res;
}

const post = (body: unknown, opts: { token?: string | null; type?: string; raw?: string } = {}) =>
  new Request("https://capture.test/v1/events", {
    method: "POST",
    headers: {
      "content-type": opts.type ?? "application/json",
      ...(opts.token === null ? {} : { authorization: `Bearer ${opts.token ?? TOKEN}` }),
    },
    body: opts.raw ?? JSON.stringify(body),
  });

const r2Lines = async (key: string) =>
  new TextDecoder().decode(await (await env.RUNS.get(key))!.arrayBuffer()).trim().split("\n");

const get = (path: string) => new Request(`https://capture.test${path}`);

beforeEach(async () => {
  await env.DB.batch(["runs", "turns", "feed", "forwards"].map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
  const listed = await env.RUNS.list();
  await Promise.all(listed.objects.map((o) => env.RUNS.delete(o.key)));
});

describe("auth", () => {
  it("rejects a missing or wrong bearer token", async () => {
    expect((await call(post({ events: sampleRun() }, { token: null }))).status).toBe(401);
    expect((await call(post({ events: sampleRun() }, { token: "nope" }))).status).toBe(401);
  });

  it("fails closed when no token is configured", async () => {
    const res = await call(post({ events: sampleRun() }), { ...env, CAPTURE_TOKEN: undefined });
    expect(res.status).toBe(503);
  });

  it("only POST is allowed on /v1/events", async () => {
    expect((await call(get("/v1/events"))).status).toBe(405);
  });
});

describe("schema", () => {
  it("rejects the whole batch when one event fails events.v1.json, and says where", async () => {
    const run = sampleRun();
    (run[3] as any).data.tool_call.type = "custom";
    const res = await call(post({ events: run }));
    expect(res.status).toBe(400);
    const body = await res.json<any>();
    expect(body.index).toBe(3);
    expect(body.schema).toBe("synter-loop.events.v1");
    expect((await env.RUNS.list()).objects).toHaveLength(0);
  });

  it("refuses content-bearing keys in data", async () => {
    const run = sampleRun();
    (run[1] as any).data.prompt = SECRET_PROMPT;
    expect((await call(post({ events: run }))).status).toBe(400);
  });

  it("refuses content on a metadata-mode event", async () => {
    const run = sampleRun().map((e) => ({ ...e, capture_mode: "metadata" as const }));
    expect((await call(post({ events: run }))).status).toBe(400);
  });

  it("refuses unsafe ids", async () => {
    const run = sampleRun();
    (run[0] as any).run_id = "../../etc";
    expect((await call(post({ events: run }))).status).toBe(400);
  });

  it("rejects bodies over the limit", async () => {
    const res = await call(post(null, { raw: "x".repeat(2048) }), { ...env, MAX_BODY_BYTES: "1024" });
    expect(res.status).toBe(413);
  });
});

describe("ingest", () => {
  it("stores one R2 object per turn and indexes the run in D1", async () => {
    const res = await call(post({ events: sampleRun() }));
    expect(res.status).toBe(202);
    const body = await res.json<any>();
    expect(body).toMatchObject({ accepted: 7, duplicates: 0 });

    const keys = (await env.RUNS.list({ prefix: "runs/run_a/" })).objects.map((o) => o.key).sort();
    expect(keys).toEqual(["runs/run_a/_session.jsonl", "runs/run_a/turn_1.jsonl"]);
    const lines = await r2Lines("runs/run_a/turn_1.jsonl");
    expect(lines).toHaveLength(6);
    expect(JSON.parse(lines[0]!).content.prompt).toBe(SECRET_PROMPT); // R2 keeps full capture

    const run = await env.DB.prepare("SELECT * FROM runs WHERE run_id = 'run_a'").first<any>();
    expect(run).toMatchObject({
      session_id: "sess_run_a", variant_id: "hv_test", variant_label: "test", turn_count: 1, event_count: 7,
      tool_calls: 1, input_tokens: 2700, output_tokens: 420, cache_tokens: 800, reasoning_tokens: 50,
    });
    expect(run.cost_usd).toBeCloseTo(0.02, 6);
    const turn = await env.DB.prepare("SELECT * FROM turns WHERE turn_key = 'turn_1'").first<any>();
    expect(turn).toMatchObject({ status: "ok", event_count: 6, r2_key: "runs/run_a/turn_1.jsonl" });
  });

  it("accepts JSONL", async () => {
    const raw = sampleRun().map((e) => JSON.stringify(e)).join("\n");
    const res = await call(post(null, { raw, type: "application/x-ndjson" }));
    expect(res.status).toBe(202);
    expect((await res.json<any>()).accepted).toBe(7);
  });

  it("a retried POST leaves no duplicates and the rollups unchanged", async () => {
    await call(post({ events: sampleRun() }));
    const before = await env.DB.prepare("SELECT * FROM runs WHERE run_id = 'run_a'").first();
    const res = await call(post({ events: sampleRun() }));
    expect(await res.json<any>()).toMatchObject({ accepted: 0, duplicates: 7 });
    const lines = await r2Lines("runs/run_a/turn_1.jsonl");
    expect(lines).toHaveLength(6);
    const after = await env.DB.prepare("SELECT * FROM runs WHERE run_id = 'run_a'").first();
    expect({ ...after, updated_at: 0 }).toEqual({ ...before, updated_at: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM feed").first("n")).toBe(7);
  });

  it("a turn posted in parts merges into one object; rollups equal the single-post totals", async () => {
    const run = sampleRun();
    await call(post({ events: run.slice(0, 3) }));
    await call(post({ events: run.slice(2) })); // overlaps on event 2
    const lines = await r2Lines("runs/run_a/turn_1.jsonl");
    expect(lines.map((l) => JSON.parse(l).seq)).toEqual([1, 2, 3, 4, 5, 6]);
    const r = await env.DB.prepare("SELECT input_tokens, output_tokens, event_count FROM runs").first();
    expect(r).toEqual({ input_tokens: 2700, output_tokens: 420, event_count: 7 });
  });

  it("rollups across runs recompute exactly from the raw R2 objects", async () => {
    await call(post({ events: [...sampleRun("run_a", "t1"), ...sampleRun("run_b", "t2")] }));
    let tokens = 0;
    for (const o of (await env.RUNS.list()).objects) {
      for (const line of await r2Lines(o.key)) {
        const e = JSON.parse(line);
        if (e.event === "agent_model_call") tokens += e.data.usage.input_tokens;
      }
    }
    expect(await env.DB.prepare("SELECT SUM(input_tokens) AS t FROM runs").first("t")).toBe(tokens);
  });
});

describe("metadata only beyond R2", () => {
  it("toMetadata removes content and content keys at any depth", () => {
    const e: any = sampleRun()[3];
    e.data.nested = { result: "x", ok: 1, list: [{ arguments: "y", keep: 2 }] };
    const m: any = toMetadata(e);
    expect(m.content).toBeUndefined();
    expect(m.data.nested).toEqual({ ok: 1, list: [{ keep: 2 }] });
    expect(m.data.tool_call.function.name).toBe("synter_run");
  });

  it("the feed carries no prompt or result text", async () => {
    await call(post({ events: sampleRun() }));
    const text = await (await call(get("/v1/feed?after=0"))).text();
    expect(text).not.toContain(SECRET_PROMPT);
    expect(text).not.toContain(SECRET_RESULT);
    expect(text).not.toContain('"content"');
    const body = JSON.parse(text);
    expect(body.events).toHaveLength(7);
    expect(body.next).toBe(body.events[6].cursor);
    expect(body.events.map((e: any) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const more = await (await call(get(`/v1/feed?after=${body.next}`))).json<any>();
    expect(more.events).toHaveLength(0);
  });

  it("sGTM gets one metadata-only POST per new event when the relay is on, none for duplicates", async () => {
    const sent: Sent[] = [];
    const on = { ...env, SGTM_FORWARD: "on" };
    await call(post({ events: sampleRun() }), on, deps(sent));
    expect(sent).toHaveLength(7);
    expect(new Set(sent.map((s) => s.url))).toEqual(new Set(["https://arxmgigt.usv.stape.io/agent-events"]));
    for (const s of sent) {
      expect(s.body).not.toContain(SECRET_PROMPT);
      expect(s.body).not.toContain(SECRET_RESULT);
      expect(s.body).not.toContain("arguments");
    }
    await call(post({ events: sampleRun() }), on, deps(sent));
    expect(sent).toHaveLength(7);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM forwards WHERE status = 'sent'").first("n")).toBe(7);
  });

  it("with the relay off nothing is sent and every event is recorded as skipped", async () => {
    const sent: Sent[] = [];
    await call(post({ events: sampleRun() }), env, deps(sent));
    expect(sent).toHaveLength(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM forwards WHERE status = 'skipped'").first("n")).toBe(7);
  });

  it("a failing sGTM is recorded, never surfaced to the client", async () => {
    const res = await call(post({ events: sampleRun() }), { ...env, SGTM_FORWARD: "on" }, deps([], 500));
    expect(res.status).toBe(202);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM forwards WHERE status = 'failed'").first("n")).toBe(7);
  });
});

describe("read API", () => {
  it("lists runs and returns one run with its turns", async () => {
    await call(post({ events: sampleRun() }));
    const runs = await (await call(get("/v1/runs"))).json<any>();
    expect(runs.runs.map((r: any) => r.run_id)).toEqual(["run_a"]);
    const one = await (await call(get("/v1/runs/run_a"))).json<any>();
    expect(one.turns.map((t: any) => t.turn_key).sort()).toEqual(["_session", "turn_1"]);
    expect((await call(get("/v1/runs/missing"))).status).toBe(404);
  });

  it("needs the token when the feed is not public", async () => {
    const closed = { ...env, FEED_PUBLIC: "off" };
    expect((await call(get("/v1/feed"), closed)).status).toBe(401);
    const authed = new Request("https://capture.test/v1/feed", { headers: { authorization: `Bearer ${TOKEN}` } });
    expect((await call(authed, closed)).status).toBe(200);
  });

  it("streams the feed as SSE and resumes from Last-Event-ID", async () => {
    await call(post({ events: sampleRun() }));
    const all = (await (await call(get("/v1/feed?after=0"))).json<any>()).events.map((e: any) => e.cursor);
    const ctx = createExecutionContext();
    const res = await handle(
      new Request("https://capture.test/v1/feed/stream?duration_ms=0", { headers: { "last-event-id": String(all[4]) } }),
      env, ctx, deps(),
    );
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    await waitOnExecutionContext(ctx);
    const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    expect(ids).toEqual(all.slice(5));
    expect(text).not.toContain(SECRET_PROMPT);
  });

  it("reports health without secrets", async () => {
    const body = await (await call(get("/healthz"))).json<any>();
    expect(body).toEqual({ ok: true, service: "agent-capture", schema: "synter-loop.events.v1", sgtm_forward: "off" });
  });
});
