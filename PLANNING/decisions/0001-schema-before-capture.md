# ADR 0001 - The event schema ships with the capture Worker (Phase 0), not after it

Status: accepted (Phase 0)

## Context
PROMPT.md lists `schema/events.v1.json` under Phase 1, but Phase 0 deploys `agent-capture`, which accepts events. AGENTS.md rule 6 says the schema exists and is tested before features ship.

## Decision
Phase 0 writes `schema/events.v1.json` with the envelope every event shares (schema id, event_id, event name, ts, run_id, session_id, turn_id, harness_variant, data, content) and the nine event names. The Worker validates every event against it at ingest and its tests cover rejection. Phase 1 extends the per-event `data` payloads (additive only) and adds the Python-side tests that validate every emitted event.

## Consequences
- The Worker never stores an event the schema rejects.
- The split between metadata and content is part of the schema: anything only `capture: full` may record lives under `content`. The Worker strips `content` before sGTM and the live feed, which makes "GA4 payloads carry no prompt or result text" a structural property, with a deny-list as a second check.
