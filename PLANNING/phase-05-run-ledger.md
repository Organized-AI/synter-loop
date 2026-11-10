# Phase 05 — Run + ledger

## Outcome
Record proposals, dry-run outputs, user approval evidence when available, and read-back mismatches in an append-only, profile-scoped ledger.

## Implementation scope
- Keep the unit bounded and observable; capture evidence before attempting optimization.
- Use synthetic/offline fixtures for local build checks. Do not read `.env` or access production accounts.
- Treat remote service contracts as unverified unless source/docs or a captured fixture prove them.

## Acceptance gate
Ledger format is versioned; dry-run/proposal are deterministic; live execution is disabled in this local build; idempotency prevents duplicates; malformed read-back is surfaced.

## Release boundary
A local green gate is evidence for this phase only. No live spend, GTM publication, public deployment, production Hermes install/restart, git push, PR, or catalog submission is implied.
