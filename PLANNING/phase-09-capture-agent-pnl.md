# Phase 09 — Runtime capture + Agent P&L

## Outcome
Observe selected Hermes lifecycle hooks, validate events, redact/cap full payloads, retry idempotently, and compute transparent local rollups from raw fixtures.

## Implementation scope
- Keep the unit bounded and observable; capture evidence before attempting optimization.
- Use synthetic/offline fixtures for local build checks. Do not read `.env` or access production accounts.
- Treat remote service contracts as unverified unless source/docs or a captured fixture prove them.

## Acceptance gate
Capture off emits no outbound request; metadata omits text; full mode redacts secrets and caps results; retry IDs dedupe; rollups recompute exactly; every row carries harness variant; holdout is fixed per session.

## Release boundary
A local green gate is evidence for the phase only. No live spend, GTM publication, public deployment, production Hermes install/restart, git push, PR, or catalog submission is implied.
