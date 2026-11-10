# Phase 08 — Surfaces + compatibility

## Outcome
Provide `/ads` commands, CLI commands, watch JSON contract, bundled skill, and an external compatibility-test recipe.

## Implementation scope
- Keep the unit bounded and observable; capture evidence before attempting optimization.
- Use synthetic/offline fixtures for local build checks. Do not read `.env` or access production accounts.
- Treat remote service contracts as unverified unless source/docs or a captured fixture prove them.

## Acceptance gate
Commands parse/validate without network; watch output matches contract; apply re-runs gates but returns blocked in local mode; no external superagent package is installed or vendored; compatibility profile is documented.

## Release boundary
A local green gate is evidence for the phase only. No live spend, GTM publication, public deployment, production Hermes install/restart, git push, PR, or catalog submission is implied.
