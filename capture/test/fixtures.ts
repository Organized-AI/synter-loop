import type { CaptureEvent } from "../src/env";

export const TOKEN = "test-capture-token";
export const SECRET_PROMPT = "raise the Meta budget to 900 for campaign Spring Sale";
export const SECRET_RESULT = "budget updated: 900.00 USD daily";

const variant = { id: "hv_test", label: "test", plugin_version: "0.1.0", model: "anthropic/claude-opus-5-5" };

let n = 0;
const ts = () => new Date(Date.UTC(2026, 10, 7, 12, 0, n++)).toISOString();

/** A full-capture run: session start, then one turn with a model call, a gated tool call and completion. */
export function sampleRun(runId = "run_a", turnId = "turn_1"): CaptureEvent[] {
  n = 0;
  const base = { schema: "synter-loop.events.v1" as const, run_id: runId, session_id: `sess_${runId}`, capture_mode: "full" as const, harness_variant: variant };
  return [
    { ...base, event_id: `${runId}:session_start`, event: "agent_session_start", ts: ts(), seq: 0, turn_id: null, data: { platform: "cli" } },
    { ...base, event_id: `${turnId}:turn_start`, event: "agent_turn_start", ts: ts(), seq: 1, turn_id: turnId, data: {}, content: { prompt: SECRET_PROMPT } },
    {
      ...base, event_id: `${turnId}:model_call:1`, event: "agent_model_call", ts: ts(), seq: 2, turn_id: turnId,
      data: { model: "anthropic/claude-opus-5-5", latency_ms: 812, usage: { input_tokens: 1200, output_tokens: 300, cache_read_tokens: 800, reasoning_tokens: 50 }, cost_usd: 0.0125 },
    },
    {
      ...base, event_id: "call_abc:tool_call", event: "agent_tool_call", ts: ts(), seq: 3, turn_id: turnId,
      data: { tool_call: { id: "call_abc", type: "function", function: { name: "synter_run" } }, status: "blocked", latency_ms: 40 },
      content: { tool_call: { id: "call_abc", type: "function", function: { name: "synter_run", arguments: JSON.stringify({ budget: 900 }) } }, result: SECRET_RESULT },
    },
    { ...base, event_id: `${turnId}:gate`, event: "agent_gate_decision", ts: ts(), seq: 4, turn_id: turnId, data: { decision: "block", reason: "over max_change_usd" } },
    {
      ...base, event_id: `${turnId}:model_call:2`, event: "agent_model_call", ts: ts(), seq: 5, turn_id: turnId,
      data: { model: "anthropic/claude-opus-5-5", usage: { input_tokens: 1500, output_tokens: 120 }, cost_usd: 0.0075 },
    },
    { ...base, event_id: `${turnId}:turn_complete`, event: "agent_turn_complete", ts: ts(), seq: 6, turn_id: turnId, data: { status: "ok" }, content: { assistant_response: SECRET_RESULT } },
  ] as CaptureEvent[];
}
