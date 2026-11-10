# Phase 02 — Synter client + read tools

## Outcome
Implement a bounded asynchronous Streamable HTTP MCP client and read-only status, performance, reconciliation, action-search, and tracking-health tools.

## Implementation scope
- Keep the unit bounded and observable; capture evidence before attempting optimization.
- Use synthetic/offline fixtures for local build checks. Do not read `.env` or access production accounts.
- Treat remote service contracts as unverified unless source/docs or a captured fixture prove them.

## Acceptance gate
Transport unit tests cover JSON and SSE response shapes, session headers, timeouts, redacted errors, and fake credentials; handlers use offline fakes and never call external writes; missing credentials return safe JSON.

## Release boundary
A local green gate is evidence for this phase only. No live spend, GTM publication, public deployment, production Hermes install/restart, git push, PR, or catalog submission is implied.
