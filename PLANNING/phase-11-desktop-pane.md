# Phase 11 — Desktop pane

## Outcome
Build a native Desktop plugin using only the documented SDK, with read-only status, ledger, Jev, grade, and Agent P&L views.

## Implementation scope
- Keep the unit bounded and observable; capture evidence before attempting optimization.
- Use synthetic/offline fixtures for local build checks. Do not read `.env` or access production accounts.
- Treat remote service contracts as unverified unless source/docs or a captured fixture prove them.

## Acceptance gate
JavaScript syntax checks; no undeclared capability or raw network call; empty state is useful; backend errors are visibly labeled; no pane action can authorize spend or publish GTM.

## Release boundary
A local green gate is evidence for this phase only. No live spend, GTM publication, public deployment, production Hermes install/restart, git push, PR, or catalog submission is implied.
