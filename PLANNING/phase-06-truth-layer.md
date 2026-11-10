# Phase 06 — Truth Layer

## Outcome
Add performance-intent detection, same-run source reconciliation, and factual-number annotations/corrections using fixture-grounded evidence.

## Implementation scope
- Keep the unit bounded and observable; capture evidence before attempting optimization.
- Use synthetic/offline fixtures for local build checks. Do not read `.env` or access production accounts.
- Treat remote service contracts as unverified unless source/docs or a captured fixture prove them.

## Acceptance gate
Wrong-number fixture gains source/run footnotes or checked replacement; correct number stays unchanged; unrelated turns remain untouched; absent or stale evidence never creates a confident claim.

## Release boundary
A local green gate is evidence for the phase only. No live spend, GTM publication, public deployment, production Hermes install/restart, git push, PR, or catalog submission is implied.
