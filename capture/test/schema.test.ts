import { describe, expect, it } from "vitest";
import schema from "../../schema/events.v1.json";
import { validateEvents } from "../src/ingest";
import { sampleRun } from "./fixtures";

const NAMES = [
  "agent_session_start", "agent_turn_start", "agent_model_call", "agent_tool_call", "agent_subagent",
  "agent_gate_decision", "agent_approval", "agent_turn_complete", "agent_outcome",
];

describe("events.v1.json", () => {
  it("names exactly the nine events in PROMPT.md", () => {
    expect([...(schema as any).$defs.event_name.enum].sort()).toEqual([...NAMES].sort());
  });

  it("accepts every fixture event", () => {
    expect(validateEvents(sampleRun())).toBeNull();
  });

  it("accepts a minimal event of every name", () => {
    const base = { schema: "synter-loop.events.v1", run_id: "r", session_id: "s", turn_id: "t", ts: "2026-11-07T12:00:00Z", capture_mode: "metadata", harness_variant: { id: "h", plugin_version: "0.1.0" } };
    const data: Record<string, object> = {
      agent_model_call: { model: "m" },
      agent_tool_call: { tool_call: { id: "c", type: "function", function: { name: "synter_status" } }, status: "ok" },
      agent_gate_decision: { decision: "pass" },
    };
    const events = NAMES.map((name, i) => ({ ...base, event_id: `e${i}`, event: name, data: data[name] ?? {} }));
    expect(validateEvents(events)).toBeNull();
  });

  it("requires a turn_id on turn-scoped events and harness_variant on all", () => {
    const [, turnStart] = sampleRun();
    expect(validateEvents([{ ...turnStart, turn_id: null }])).not.toBeNull();
    const { harness_variant: _, ...noVariant } = turnStart as any;
    expect(validateEvents([noVariant])).not.toBeNull();
  });

  it("requires tool-call arguments to be a JSON string in full capture (OpenAI shape)", () => {
    const run = sampleRun();
    (run[3] as any).content.tool_call.function.arguments = { budget: 900 };
    expect(validateEvents(run)?.index).toBe(3);
  });
});
