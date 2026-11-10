# Phase 03 — Spend Guard

## Outcome
Classify external mutations, enforce caps/dry-run/tracking/freeze/unattended policy, and produce evidence-backed proposals without argument mutation.

## Implementation scope
- Keep the unit bounded and observable; capture evidence before attempting optimization.
- Use synthetic/offline fixtures for local build checks. Do not read `.env` or access production accounts.
- Treat remote service contracts as unverified unless source/docs or a captured fixture prove them.

## Acceptance gate
Read tools pass; unknown tool effects and Synter failure block; cap exceedance, broken tracking, cron identity, propose-only, and freeze block; in-cap change becomes proposal/approval directive; hook latency stays bounded and failures fail closed for writes.

## Release boundary
A local green gate is evidence for this phase only. No live spend, GTM publication, public deployment, production Hermes install/restart, git push, PR, or catalog submission is implied.
