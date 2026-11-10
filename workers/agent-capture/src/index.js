const EVENT_TYPES = new Set([
  "agent_session_start", "agent_turn_start", "agent_model_call", "agent_tool_call",
  "agent_subagent", "agent_gate_decision", "agent_approval", "agent_turn_complete", "agent_outcome",
]);
const PAYLOAD_REQUIRED = {
  agent_session_start: ["capture_mode"],
  agent_turn_start: ["message_hash"],
  agent_model_call: ["model", "status", "latency_ms", "input_tokens", "output_tokens", "cached_tokens", "reasoning_tokens", "cost_usd"],
  agent_tool_call: ["tool_name", "status", "latency_ms", "effect"],
  agent_subagent: ["child_id", "status"],
  agent_gate_decision: ["tool_name", "decision", "reasons"],
  agent_approval: ["tool_name", "approved"],
  agent_turn_complete: ["status", "total_tokens", "cost_usd", "latency_ms"],
  agent_outcome: ["proposal_id", "grade", "source", "days_after"],
};
const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_BODY_BYTES = 1_000_000;
const MAX_BATCH_EVENTS = 100;
const MAX_BATCH_BYTES = 250_000;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function validEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return "event must be an object";
  const required = ["event_id", "event_type", "schema_version", "timestamp", "run_id", "session_id", "turn_id", "harness_variant", "payload"];
  if (required.some((key) => !(key in event))) return "event is missing required envelope fields";
  if (Object.keys(event).some((key) => !required.includes(key))) return "event has unexpected envelope fields";
  if (typeof event.event_id !== "string" || !ID_RE.test(event.event_id)) return "event_id is invalid";
  if (typeof event.run_id !== "string" || !ID_RE.test(event.run_id)) return "run_id is invalid";
  if (event.turn_id !== null && (typeof event.turn_id !== "string" || !ID_RE.test(event.turn_id))) return "turn_id is invalid";
  if (event.session_id !== null && typeof event.session_id !== "string") return "session_id is invalid";
  if (event.schema_version !== 1) return "schema_version must equal 1";
  if (!EVENT_TYPES.has(event.event_type)) return "event_type is unsupported";
  if (typeof event.timestamp !== "string" || !Number.isFinite(Date.parse(event.timestamp)) || !/(Z|[+-]\d{2}:?\d{2})$/i.test(event.timestamp)) return "timestamp must be a timezone-qualified date-time";
  if (!event.harness_variant || typeof event.harness_variant !== "object" || Array.isArray(event.harness_variant)) return "harness_variant must be an object";
  const variantRequired = ["prompt_hash", "skill_versions", "model", "plugin_version", "jev_map_version", "holdout", "holdout_variant"];
  const variantAllowed = new Set(variantRequired);
  if (variantRequired.some((key) => !(key in event.harness_variant))) return "harness_variant is missing required fields";
  if (Object.keys(event.harness_variant).some((key) => !variantAllowed.has(key))) return "harness_variant has unexpected fields";
  if (typeof event.harness_variant.prompt_hash !== "string" || typeof event.harness_variant.model !== "string" || typeof event.harness_variant.plugin_version !== "string") return "harness_variant string fields are invalid";
  if (!event.harness_variant.skill_versions || typeof event.harness_variant.skill_versions !== "object" || Array.isArray(event.harness_variant.skill_versions)) return "skill_versions must be an object";
  if (Object.values(event.harness_variant.skill_versions).some((value) => typeof value !== "string")) return "skill_versions values must be strings";
  if (typeof event.harness_variant.holdout !== "boolean") return "holdout must be boolean";
  if (event.harness_variant.jev_map_version !== null && typeof event.harness_variant.jev_map_version !== "string") return "jev_map_version is invalid";
  if (event.harness_variant.holdout_variant !== null && typeof event.harness_variant.holdout_variant !== "string") return "holdout_variant is invalid";
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return "payload must be an object";
  if (PAYLOAD_REQUIRED[event.event_type].some((key) => !(key in event.payload))) return `payload is missing fields for ${event.event_type}`;
  return null;
}

function bearerMatches(header, expected) {
  if (!expected || typeof header !== "string") return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const actual = header.slice(prefix.length);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function metadataOnly(event) {
  const p = event.payload || {};
  const fields = ["status", "latency_ms", "input_tokens", "output_tokens", "cached_tokens", "reasoning_tokens", "total_tokens", "cost_usd", "effect", "decision", "approved", "grade", "source", "days_after", "capture_mode"];
  const payload = {};
  for (const key of fields) {
    const value = p[key];
    if (typeof value === "number" || typeof value === "boolean" || (typeof value === "string" && value.length <= 80)) payload[key] = value;
  }
  for (const key of ["tool_name", "model", "child_id", "proposal_id"]) {
    if (typeof p[key] === "string" && p[key].length <= 120) payload[key] = p[key];
  }
  if (Array.isArray(p.reasons)) payload.reason_count = p.reasons.length;
  return {
    event_id: event.event_id,
    event_type: event.event_type,
    timestamp: event.timestamp,
    run_id: event.run_id,
    turn_id: event.turn_id,
    harness_variant: {
      model: event.harness_variant.model,
      plugin_version: event.harness_variant.plugin_version,
      prompt_hash: event.harness_variant.prompt_hash,
      holdout: event.harness_variant.holdout,
      holdout_variant: event.harness_variant.holdout_variant,
    },
    payload,
  };
}

async function readBoundedText(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

function tableExists(db) {
  if (!db) throw new Error("D1 binding DB is not configured");
}

async function appendTurn(env, events) {
  const runId = events[0].run_id;
  const turnId = events[0].turn_id || "session";
  const key = `runs/${runId}/${turnId}.jsonl`;
  const previous = await env.EVENTS.get(key);
  const oldLines = previous ? (await previous.text()).split("\n").filter(Boolean) : [];
  const oldById = new Map();
  for (const line of oldLines) {
    const parsed = JSON.parse(line);
    oldById.set(parsed.event_id, line);
  }
  const newLines = [];
  for (const event of events) {
    const canonical = JSON.stringify(event);
    const old = oldById.get(event.event_id);
    if (old && old !== canonical) return { conflict: true };
    if (!old) {
      oldById.set(event.event_id, canonical);
      newLines.push(canonical);
    }
  }
  if (newLines.length) {
    const content = [...oldLines, ...newLines].join("\n") + "\n";
    await env.EVENTS.put(key, content, { httpMetadata: { contentType: "application/x-ndjson" }, customMetadata: { run_id: runId, turn_id: turnId } });
  }
  return { key, count: newLines.length, runId, turnId };
}

async function indexEvents(env, events, appendResult) {
  tableExists(env.DB);
  const now = events.map((event) => event.timestamp).sort().at(-1);
  const stmts = [
    env.DB.prepare("INSERT INTO agent_runs (run_id, first_seen, last_seen, event_count) VALUES (?, ?, ?, 0) ON CONFLICT(run_id) DO UPDATE SET last_seen = MAX(agent_runs.last_seen, excluded.last_seen)")
      .bind(appendResult.runId, now, now),
    ...events.map((event) => env.DB.prepare("INSERT OR IGNORE INTO agent_events (event_id, run_id, turn_id, event_type, timestamp, model, plugin_version, holdout) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(event.event_id, event.run_id, event.turn_id, event.event_type, event.timestamp, event.harness_variant.model, event.harness_variant.plugin_version, event.harness_variant.holdout ? 1 : 0)),
    env.DB.prepare("UPDATE agent_runs SET event_count = (SELECT COUNT(*) FROM agent_events WHERE run_id = ?) WHERE run_id = ?")
      .bind(appendResult.runId, appendResult.runId),
  ];
  await env.DB.batch(stmts);
}

function queryLimit(url) {
  const n = Number(url.searchParams.get("limit") || 50);
  return Number.isInteger(n) ? Math.min(Math.max(n, 1), 200) : 50;
}

async function liveIndex(env, url) {
  tableExists(env.DB);
  const limit = queryLimit(url);
  const result = await env.DB.prepare("SELECT r.run_id, r.first_seen, r.last_seen, r.event_count, COALESCE(MAX(e.holdout), 0) AS holdout FROM agent_runs r LEFT JOIN agent_events e ON e.run_id = r.run_id GROUP BY r.run_id ORDER BY r.last_seen DESC LIMIT ?").bind(limit).all();
  return json({ ok: true, runs: result.results || [] });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  const configured = env.ALLOWED_ORIGIN;
  if (!origin || !configured) return {};
  if (origin === configured) return { "access-control-allow-origin": configured, "vary": "Origin" };
  return {};
}

async function forwardSgtm(env, events) {
  if (env.SGTM_FORWARD !== "true" || !env.SGTM_ENDPOINT) return;
  const url = new URL(env.SGTM_ENDPOINT);
  if (url.protocol !== "https:") return;
  const payload = { events: events.map(metadataOnly) };
  const headers = { "content-type": "application/json" };
  if (env.SGTM_TOKEN) headers.authorization = `Bearer ${env.SGTM_TOKEN}`;
  try {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(3000) });
    if (!response.ok) console.warn("sGTM metadata relay rejected", response.status);
  } catch (error) {
    console.warn("sGTM metadata relay failed", error?.name || "Error");
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      const origin = allowedOrigin(request, env);
      return new Response(null, { status: 204, headers: { ...origin, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "authorization,content-type", "access-control-max-age": "86400" } });
    }
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "agent-capture" });
    if (request.method === "GET" && url.pathname === "/live") {
      try { return await liveIndex(env, url); } catch { return json({ ok: false, error: "live index unavailable" }, 503); }
    }
    if (request.method !== "POST" || url.pathname !== "/v1/events") return json({ ok: false, error: "not found" }, 404);
    if (!env.CAPTURE_TOKEN) return json({ ok: false, error: "capture endpoint is not configured" }, 503);
    if (!bearerMatches(request.headers.get("authorization"), env.CAPTURE_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_BODY_BYTES) return json({ ok: false, error: "request too large" }, 413);
    if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) return json({ ok: false, error: "content-type must be application/json" }, 415);
    let raw;
    try { raw = await readBoundedText(request, MAX_BODY_BYTES); } catch { return json({ ok: false, error: "invalid request body" }, 400); }
    if (raw === null) return json({ ok: false, error: "request too large" }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
    const events = Array.isArray(body) ? body : body?.events;
    if (!Array.isArray(events) || events.length < 1 || events.length > MAX_BATCH_EVENTS) return json({ ok: false, error: `events must contain 1-${MAX_BATCH_EVENTS} items` }, 400);
    if (new TextEncoder().encode(JSON.stringify(events)).byteLength > MAX_BATCH_BYTES) return json({ ok: false, error: "event batch too large" }, 413);
    for (const event of events) {
      const error = validEvent(event);
      if (error) return json({ ok: false, error }, 400);
    }
    const runId = events[0].run_id;
    const turnId = events[0].turn_id;
    if (events.some((event) => event.run_id !== runId || event.turn_id !== turnId)) return json({ ok: false, error: "all events in a batch must share run_id and turn_id" }, 400);
    try {
      const appended = await appendTurn(env, events);
      if (appended.conflict) return json({ ok: false, error: "event_id reused with different content" }, 409);
      await indexEvents(env, events, appended);
      await forwardSgtm(env, events);
      return json({ ok: true, run_id: runId, turn_id: turnId, accepted: events.length, added: appended.count }, 202, allowedOrigin(request, env));
    } catch {
      return json({ ok: false, error: "capture persistence failed; retry with the same event IDs" }, 503);
    }
  },
};

export { validEvent, bearerMatches, metadataOnly, appendTurn, indexEvents, MAX_BODY_BYTES, MAX_BATCH_EVENTS, MAX_BATCH_BYTES };
