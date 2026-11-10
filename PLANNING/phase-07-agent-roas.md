# Phase 07 — Agent ROAS

## Outcome
Model delayed grading as a scheduled/local job over approved-change fixtures, recording before/after evidence and proposed Jev outcomes.

## Implementation scope
- Keep the unit bounded and observable; capture evidence before attempting optimization.
- Use synthetic/offline fixtures for local build checks. Do not read `.env` or access production accounts.
- Treat remote service contracts as unverified unless source/docs or a captured fixture prove them.

## Acceptance gate
Older-than-threshold fixture is graded once; early changes are skipped; duplicates are idempotent; grades cannot change spend; results carry source window and uncertainty.

## Release boundary
A local green gate is evidence for the phase only. No live spend, GTM publication, public deployment, production Hermes install/restart, git push, PR, or catalog submission is implied.
