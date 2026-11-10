import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker, { appendTurn, bearerMatches, metadataOnly, validEvent } from "../agent-capture/src/index.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/event.json", import.meta.url), "utf8"));

class MemoryR2 {
  objects = new Map();
  async get(key) {
    const value = this.objects.get(key);
    return value === undefined ? null : { text: async () => value };
  }
  async put(key, value) { this.objects.set(key, String(value)); }
}
class MemoryD1 {
  runs = new Map();
  events = new Map();
  prepare(sql) {
    const db = this;
    const statement = {
      sql,
      args: [],
      bind(...args) { this.args = args; return this; },
      all: async () => ({ results: [...db.runs.values()] }),
    };
    return statement;
  }
  async batch(stmts) {
    for (const { sql, args } of stmts) {
      if (sql.startsWith("INSERT INTO agent_runs")) {
        const [run_id, first_seen, last_seen] = args;
        const prior = this.runs.get(run_id);
        this.runs.set(run_id, { run_id, first_seen: prior?.first_seen || first_seen, last_seen: last_seen, event_count: prior?.event_count || 0 });
      } else if (sql.startsWith("INSERT OR IGNORE INTO agent_events")) {
        const [event_id, run_id, turn_id, event_type, timestamp, model, plugin_version, holdout] = args;
        if (!this.events.has(event_id)) this.events.set(event_id, { event_id, run_id, turn_id, event_type, timestamp, model, plugin_version, holdout });
      } else if (sql.startsWith("UPDATE agent_runs")) {
        const [run_id] = args;
        const run = this.runs.get(run_id);
        run.event_count = [...this.events.values()].filter((event) => event.run_id === run_id).length;
      }
    }
    return [];
  }
}

function request(body, authorization = "Bearer local-token") {
  return new Request("https://worker.test/v1/events", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("accepts the documented synthetic fixture", () => {
  assert.equal(validEvent(fixture), null);
});

test("rejects missing event payload requirements and unknown envelope fields", () => {
  const missing = structuredClone(fixture);
  missing.payload = {};
  assert.match(validEvent(missing), /missing fields/);
  const extra = { ...structuredClone(fixture), prompt: "should not be a top-level event field" };
  assert.match(validEvent(extra), /unexpected envelope fields/);
});

test("bearer comparison rejects missing, wrong, and unequal-length secrets", () => {
  assert.equal(bearerMatches("Bearer local-token", "local-token"), true);
  assert.equal(bearerMatches("Bearer other-token", "local-token"), false);
  assert.equal(bearerMatches("Bearer x", "local-token"), false);
  assert.equal(bearerMatches(null, "local-token"), false);
});

test("metadata allow-list excludes prompt, response, result, and arbitrary payload data", () => {
  const event = structuredClone(fixture);
  event.payload.prompt = "sensitive user message";
  event.payload.result = "sensitive tool output";
  event.payload.response = "sensitive assistant text";
  event.payload.extra = { prompt: "nested" };
  const projected = metadataOnly(event);
  assert.deepEqual(projected.payload, { tool_name: "synter_status", status: "ok", latency_ms: 12, effect: "read" });
  assert.equal(JSON.stringify(projected).includes("sensitive"), false);
});

test("R2 append is idempotent and detects event ID reuse with changed content", async () => {
  const env = { EVENTS: new MemoryR2() };
  const first = await appendTurn(env, [fixture]);
  assert.equal(first.count, 1);
  const retry = await appendTurn(env, [fixture]);
  assert.equal(retry.count, 0);
  const changed = { ...structuredClone(fixture), payload: { ...fixture.payload, status: "error" } };
  const conflict = await appendTurn(env, [changed]);
  assert.equal(conflict.conflict, true);
});

test("HTTP ingest rejects unauthorized requests and indexes accepted synthetic events", async () => {
  const env = { CAPTURE_TOKEN: "local-token", EVENTS: new MemoryR2(), DB: new MemoryD1(), SGTM_FORWARD: "false" };
  const denied = await worker.fetch(request([fixture], "Bearer wrong"), env);
  assert.equal(denied.status, 401);
  const accepted = await worker.fetch(request([fixture]), env);
  assert.equal(accepted.status, 202);
  assert.deepEqual(await accepted.json(), { ok: true, run_id: "fixture-run", turn_id: "fixture-turn", accepted: 1, added: 1 });
  const duplicate = await worker.fetch(request([fixture]), env);
  assert.equal(duplicate.status, 202);
  assert.equal((await duplicate.json()).added, 0);
  assert.equal(env.DB.events.size, 1);
  assert.equal(env.DB.runs.get("fixture-run").event_count, 1);
  const stored = env.EVENTS.objects.get("runs/fixture-run/fixture-turn.jsonl");
  assert.equal(stored.trim().split("\n").length, 1);
});

test("live API returns only the D1 index", async () => {
  const env = { DB: new MemoryD1() };
  env.DB.runs.set("r1", { run_id: "r1", first_seen: "2026-01-01T00:00:00Z", last_seen: "2026-01-01T00:00:00Z", event_count: 2, holdout: 0 });
  const response = await worker.fetch(new Request("https://worker.test/live"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, runs: [{ run_id: "r1", first_seen: "2026-01-01T00:00:00Z", last_seen: "2026-01-01T00:00:00Z", event_count: 2, holdout: 0 }] });
});
