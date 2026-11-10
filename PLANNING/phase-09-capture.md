# Phase 9 - Agent runtime capture + Agent P&L

## Deliverables
- Observer hooks (register only what is used, fast, fail-open): on_session_start, pre_llm_call, pre_api_request, post_api_request, pre_tool_call, post_tool_call, subagent_start, subagent_stop, post_approval_response, post_llm_call, on_session_end
- `capture: metadata` (IDs, model, tool names, status, tokens, cost_usd, latency, gate decisions, grades) and `capture: full` (adds prompts, system prompt once then its hash, completions, tool args and results capped at `capture_result_cap_chars`, redacted) - full-only fields live under the event's `content` object
- Relay: event_id = turn or tool-call id, local outbox with retry, POST to `capture_endpoint`; tool events in the OpenAI tool-call shape
- Turn on the Worker's sGTM relay once the Stape client exists; document sGTM client, GA4 tag and BigQuery tag setup
- `hermes synter replay <run_id>` rebuilds a run from R2 as a pytest fixture
- Agent P&L: `harness_variant` on every event, `holdout_share` / `holdout_variant`, D1 rollups built from raw R2 runs, `/harness` report; it reports and proposes only

## Gate checks
capture off sends nothing; retry leaves no duplicates; GA4 payloads carry no prompt or result text; harness_variant on every event; holdout fixed per session; `/harness` recomputes exactly from raw R2 runs.
