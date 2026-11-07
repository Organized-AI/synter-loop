export interface Env {
  DB: D1Database;
  RUNS: R2Bucket;
  CAPTURE_TOKEN?: string;
  SGTM_ENDPOINT?: string;
  SGTM_PATH?: string;
  SGTM_FORWARD?: string;
  FEED_PUBLIC?: string;
  MAX_BODY_BYTES?: string;
  MAX_EVENTS?: string;
}

/** Injectable transports, so tests never reach the real sGTM container. */
export interface Deps {
  fetch: typeof fetch;
  now: () => Date;
}

export const defaultDeps: Deps = { fetch: (input, init) => fetch(input, init), now: () => new Date() };

export const SCHEMA_ID = "synter-loop.events.v1";

export type EventName =
  | "agent_session_start"
  | "agent_turn_start"
  | "agent_model_call"
  | "agent_tool_call"
  | "agent_subagent"
  | "agent_gate_decision"
  | "agent_approval"
  | "agent_turn_complete"
  | "agent_outcome";

export interface CaptureEvent {
  schema: typeof SCHEMA_ID;
  event_id: string;
  event: EventName;
  ts: string;
  seq?: number;
  run_id: string;
  session_id: string;
  turn_id?: string | null;
  parent_session_id?: string;
  capture_mode: "metadata" | "full";
  harness_variant: { id: string; plugin_version: string; label?: string; model?: string; [k: string]: unknown };
  data: Record<string, any>;
  content?: Record<string, unknown>;
}
