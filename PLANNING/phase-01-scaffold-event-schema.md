# Phase 01 — Plugin scaffold + event schema

## Outcome
Make the package discoverable by Hermes v0.23.0, declare exact tools/hooks/config, and establish the event contract before feature code.

## Implementation scope
- Keep the unit bounded and observable; capture evidence before attempting optimization.
- Use synthetic/offline fixtures for local build checks. Do not read `.env` or access production accounts.
- Treat remote service contracts as unverified unless source/docs or a captured fixture prove them.

## Acceptance gate
`plugin.yaml` validates; `register(ctx)` exposes exactly declared tools/hooks; every fixture and emitted event validates against `schema/events.v1.json`; local JSONL append is durable; capture off has no network side effects.

## Release boundary
A local green gate is evidence for this phase only. No live spend, GTM publication, public deployment, production Hermes install/restart, git push, PR, or catalog submission is implied.
