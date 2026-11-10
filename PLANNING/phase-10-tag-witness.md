# Phase 10 — Tag Witness

## Outcome
Implement a browser-provider adapter and CDP trace reducer for dataLayer pushes and known tag requests, plus a read-only report tool.

## Implementation scope
- Keep the unit bounded and observable; capture evidence before attempting optimization.
- Use synthetic/offline fixtures for local build checks. Do not read `.env` or access production accounts.
- Treat remote service contracts as unverified unless source/docs or a captured fixture prove them.

## Acceptance gate
`is_available()` is local-only; teardown never raises; fixture page reports fired/missing tags; trace redaction removes query secrets; Kernel and local Chromium are not contacted in offline tests; GTM publish is disabled.

## Release boundary
A local green gate is evidence for this phase only. No live spend, GTM publication, public deployment, production Hermes install/restart, git push, PR, or catalog submission is implied.
