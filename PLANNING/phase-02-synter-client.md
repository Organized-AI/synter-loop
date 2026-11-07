# Phase 2 - Synter client + read tools

## Goal
Read Synter safely and offline-testably.

## Deliverables
- Async Streamable HTTP MCP client to `synter_mcp_url`, header `X-Synter-Key`, secret via `agent.secret_scope`; reuse a Hermes core HTTP/MCP dependency if one exists
- Tools: `synter_status`, `synter_performance`, `synter_reconcile`, `synter_find_action`, `synter_tracking_health`
- Fixtures recorded from Synter demo mode and Jordan's workspace, read tools only

## Gate checks
- All tool tests run offline on fixtures; no key in any fixture, log or URL
- Each tool emits `agent_tool_call` events that validate

## Rules that bite
Read tools only while recording (rules 3, 10).
