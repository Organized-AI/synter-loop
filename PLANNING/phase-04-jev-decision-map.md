# Phase 04 — Jev decision map

## Outcome
Define an adapter for map registration/scoring and evidence contract; record a local outbox item when Jev is unavailable.

## Implementation scope
- Keep the unit bounded and observable; capture evidence before attempting optimization.
- Use synthetic/offline fixtures for local build checks. Do not read `.env` or access production accounts.
- Treat remote service contracts as unverified unless source/docs or a captured fixture prove them.

## Acceptance gate
Threshold fixtures cover pass/warn/block; unreachable gateway creates an idempotent outbox item; no score authorizes a write; live contract stays blocked until gateway source/API verification.

## Release boundary
A local green gate is evidence for this phase only. No live spend, GTM publication, public deployment, production Hermes install/restart, git push, PR, or catalog submission is implied.
