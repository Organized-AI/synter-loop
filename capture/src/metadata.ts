import type { CaptureEvent } from "./env";

/**
 * Keys that carry prompt, completion, argument or result text. The schema refuses them in
 * `data`; this list strips them at any depth as a second check before anything leaves R2.
 */
export const CONTENT_KEYS: ReadonlySet<string> = new Set([
  "prompt", "user_message", "user_prompt", "system_prompt", "assistant_response", "completion",
  "messages", "conversation_history", "arguments", "args", "result", "tool_result",
  "request", "response", "content",
]);

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (CONTENT_KEYS.has(k)) continue;
      out[k] = strip(v);
    }
    return out;
  }
  return value;
}

/** The metadata-only view of an event: what sGTM and the live feed may see. */
export function toMetadata(event: CaptureEvent): Record<string, unknown> {
  return strip(event) as Record<string, unknown>;
}
