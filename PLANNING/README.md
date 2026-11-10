# Synter Loop — phase map

Adapted from Organized Codebase's phase/spec structure and verification-first workflow. The controlling build requirements remain in `PROMPT.md`; hard project rules remain in `AGENTS.md`. Each phase has one scope document and an explicit verification gate.

## Execution status
- Local source checkout: `feat/synter-loop-local-build`.
- Hermes development target: v0.23.0 in `.hermes-src`, `.venv-hermes`, isolated `.hermes-dev`.
- Authorized release scope: publish this feature branch for review and install it into a dedicated `synter-dev` profile under the isolated `.hermes-dev` home. Do not merge, deploy Workers, touch production Hermes, or perform live ad/GTM mutations.
- The profile installation must remain disabled and use no dependency installation unless separately approved. Production activation remains a separate human-controlled gate.

## Phases
0. [Cloudflare Workers](phase-00-cloudflare-workers.md) — local Worker contracts and tests
1. [Plugin scaffold + event schema](phase-01-scaffold-event-schema.md)
2. [Synter client + read tools](phase-02-synter-read-tools.md)
3. [Spend Guard](phase-03-spend-guard.md)
4. [Jev decision map](phase-04-jev-decision-map.md)
5. [Run + ledger](phase-05-run-ledger.md)
6. [Truth Layer](phase-06-truth-layer.md)
7. [Agent ROAS](phase-07-agent-roas.md)
8. [Surfaces + compatibility](phase-08-surfaces-compatibility.md)
9. [Runtime capture + Agent P&L](phase-09-capture-agent-pnl.md)
10. [Tag Witness](phase-10-tag-witness.md)
11. [Desktop pane](phase-11-desktop-pane.md)
12. [Submission pack](phase-12-submission-pack.md)

## Release gates
Every claim needs an offline fixture or reproducible check. A local green test run is not permission to deploy, approve spend, publish tags, or submit a catalog entry. Never invent live evidence.
