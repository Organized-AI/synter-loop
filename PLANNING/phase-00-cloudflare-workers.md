# Phase 00 — Cloudflare Workers

## Outcome
Implement the agent-capture Worker, durable event index, static `/live` and `/harness` views, and sGTM relay contract from the brief. Local source and fixtures only; deployment needs separate authorization.

## Implementation scope
- Keep the unit bounded and observable; capture evidence before attempting optimization.
- Use synthetic/offline fixtures for local build checks. Do not read `.env` or access production accounts.
- Treat remote service contracts as unverified unless source/docs or a captured fixture prove them.

## Acceptance gate
Worker rejects missing/bad bearer auth; validates bounded event envelopes; stores one run/turn object and D1 index; serves redacted live metadata; sGTM payload excludes prompt/result text; duplicate/retry behavior is tested; `wrangler dev` build passes.

## Release boundary
A local green gate is evidence for this phase only. No live spend, GTM publication, public deployment, production Hermes install/restart, git push, PR, or catalog submission is implied.
