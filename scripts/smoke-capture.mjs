#!/usr/bin/env node
// Live smoke test for the deployed Workers. Sends a synthetic run labelled "smoke"
// (metadata capture, no content) and checks auth, ingest, retry, D1 index, feed and the site.
// Needs CAPTURE_ENDPOINT and CAPTURE_TOKEN in the environment; SITE_URL is optional.
// Never prints the token.
//   set -a; . ./.env; set +a; SITE_URL=https://synter-loop.jordan-691.workers.dev node scripts/smoke-capture.mjs
const endpoint = process.env.CAPTURE_ENDPOINT;
const token = process.env.CAPTURE_TOKEN;
const site = process.env.SITE_URL;
if (!endpoint || !token) {
  console.error("CAPTURE_ENDPOINT and CAPTURE_TOKEN must be set");
  process.exit(2);
}
const origin = new URL(endpoint).origin;
const runId = `smoke_${new Date().toISOString().replace(/[-:.TZ]/g, "")}`;
const turn = `${runId}_t1`;
const variant = { id: "hv_smoke", label: "smoke", plugin_version: "0.0.0-smoke" };
const base = { schema: "synter-loop.events.v1", run_id: runId, session_id: `sess_${runId}`, capture_mode: "metadata", harness_variant: variant };
const t0 = Date.now();
const ts = (i) => new Date(t0 + i * 1000).toISOString();
const events = [
  { ...base, event_id: `${runId}:session_start`, event: "agent_session_start", ts: ts(0), seq: 0, turn_id: null, data: { platform: "smoke" } },
  { ...base, event_id: `${turn}:turn_start`, event: "agent_turn_start", ts: ts(1), seq: 1, turn_id: turn, data: {} },
  { ...base, event_id: `${turn}:model_call:1`, event: "agent_model_call", ts: ts(2), seq: 2, turn_id: turn, data: { model: "smoke/fake-model", latency_ms: 10, usage: { input_tokens: 100, output_tokens: 20 }, cost_usd: 0 } },
  { ...base, event_id: `${turn}_call1:tool_call`, event: "agent_tool_call", ts: ts(3), seq: 3, turn_id: turn, data: { tool_call: { id: `${turn}_call1`, type: "function", function: { name: "synter_status" } }, status: "ok", latency_ms: 5 } },
  { ...base, event_id: `${turn}:gate`, event: "agent_gate_decision", ts: ts(4), seq: 4, turn_id: turn, data: { decision: "pass", reason: "read tool" } },
  { ...base, event_id: `${turn}:turn_complete`, event: "agent_turn_complete", ts: ts(5), seq: 5, turn_id: turn, data: { status: "ok" } },
];

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const postEvents = (auth) =>
  fetch(`${origin}/v1/events`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ events }),
  });

const health = await (await fetch(`${origin}/healthz`)).json();
check("capture /healthz", health.ok === true && health.schema === "synter-loop.events.v1", `sgtm_forward=${health.sgtm_forward}`);

const noAuth = await postEvents(false);
check("POST without token is refused", noAuth.status === 401, `status ${noAuth.status}`);

const first = await postEvents(true);
const firstBody = await first.json();
check("POST with token is accepted", first.status === 202 && firstBody.accepted === events.length, `status ${first.status}, accepted ${firstBody.accepted}`);

const retry = await postEvents(true);
const retryBody = await retry.json();
check("retried POST adds no duplicates", retry.status === 202 && retryBody.accepted === 0 && retryBody.duplicates === events.length, `accepted ${retryBody.accepted}, duplicates ${retryBody.duplicates}`);

const bad = await fetch(`${origin}/v1/events`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ events: [{ ...events[1], data: { prompt: "should be refused" } }] }),
});
check("content key in data is refused by the schema", bad.status === 400, `status ${bad.status}`);

const run = await (await fetch(`${origin}/v1/runs/${runId}`)).json();
check("D1 run index", run.run?.event_count === events.length && run.run?.turn_count === 1 && run.run?.input_tokens === 100, `events ${run.run?.event_count}, turns ${run.run?.turn_count}`);
const turnRow = (run.turns ?? []).find((t) => t.turn_key === turn);
check("one R2 object per turn", turnRow?.r2_key === `runs/${runId}/${turn}.jsonl` && turnRow?.event_count === 5, turnRow?.r2_key ?? "missing");

const feed = await (await fetch(`${origin}/v1/feed?tail=50`)).json();
const ids = new Set(feed.events.map((e) => e.event_id));
check("feed carries the run", events.every((e) => ids.has(e.event_id)));
check("feed is metadata only", feed.events.every((e) => !("content" in e)));

if (site) {
  const home = await fetch(site);
  const html = await home.text();
  check("site / serves the landing page", home.ok && html.includes("gsap/3.12.5/gsap.min.js") && html.includes("hermes plugins install"), `status ${home.status}`);
  check("site sends a CSP", (home.headers.get("content-security-policy") ?? "").includes("script-src 'self' https://cdnjs.cloudflare.com"));
  check("site loads Synter brand fonts from /assets/fonts", html.includes("/assets/fonts/inter-latin-wght-normal.woff2") && !/fonts\.googleapis|fonts\.gstatic/.test(html));
  const fontFiles = ["inter-latin-wght-normal", "ibm-plex-mono-latin-400-normal", "space-grotesk-latin-500-normal"];
  const fontRes = await Promise.all(fontFiles.map((f) => fetch(new URL(`/assets/fonts/${f}.woff2`, site))));
  check("self-hosted woff2 fonts are served", fontRes.every((r) => r.ok && (r.headers.get("content-type") ?? "").includes("font/woff2")), fontRes.map((r) => r.status).join(","));
  const live = await fetch(new URL("/live/", site));
  check("site /live/ serves the run view", live.ok && (await live.text()).includes("/assets/live.js"), `status ${live.status}`);
  const proxied = await (await fetch(new URL(`/live/api/runs/${runId}`, site))).json();
  check("site /live/api reaches agent-capture", proxied.run?.run_id === runId);
  const stream = await (await fetch(new URL("/live/api/stream?duration_ms=0", site))).text();
  check("site /live/api/stream is SSE with the run", stream.includes("event: agent_event") && stream.includes(runId));
  const media = await fetch(new URL("/media/demo.mp4", site), { method: "HEAD" });
  check("site /media/demo.mp4 is served as video/mp4", media.ok && media.headers.get("content-type") === "video/mp4", `status ${media.status}`);
  const range = await fetch(new URL("/media/demo.mp4", site), { headers: { range: "bytes=0-1023" } });
  check("demo video supports byte ranges", range.status === 206 && (await range.arrayBuffer()).byteLength === 1024, `status ${range.status}`);
  const poster = await fetch(new URL("/media/demo-poster.jpg", site), { method: "HEAD" });
  check("demo poster is served", poster.ok && poster.headers.get("content-type") === "image/jpeg", `status ${poster.status}`);
  check("landing page embeds the explainer", html.includes('id="demo-video"') && html.includes('poster="/media/demo-poster.jpg"') && html.includes("/assets/demo-video.js"));
}

console.log(`\nrun_id ${runId}`);
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
