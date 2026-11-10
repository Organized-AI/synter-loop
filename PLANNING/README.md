# PLANNING

One doc per phase, in build order. Each doc has the goal, the deliverables, the gate checks and the rules that apply. `PROMPT.md` is the source; these docs never add time estimates (AGENTS.md rule 8).

| Phase | Doc | Branch | Gate |
|---|---|---|---|
| Step 0 | [step-0-organized-codebase.md](step-0-organized-codebase.md) | `phase-0-cloudflare` | shipped with Phase 0 |
| 0 | [phase-00-cloudflare-workers.md](phase-00-cloudflare-workers.md) | `phase-0-cloudflare` | Workers deployed, URLs printed |
| 1 | [phase-01-scaffold-schema.md](phase-01-scaffold-schema.md) | `phase-1-scaffold` | `hermes plugins validate` + pytest green in CI |
| 2 | [phase-02-synter-client.md](phase-02-synter-client.md) | `phase-2-synter-client` | read tools pass offline on fixtures |
| 3 | [phase-03-spend-guard.md](phase-03-spend-guard.md) | `phase-3-spend-guard` | gate matrix green |
| 4 | [phase-04-jev.md](phase-04-jev.md) | `phase-4-jev` | pass / warn / block / unreachable |
| 5 | [phase-05-run-ledger.md](phase-05-run-ledger.md) | `phase-5-run-ledger` | ledger rows + readback mismatch flag |
| 6 | [phase-06-truth-layer.md](phase-06-truth-layer.md) | `phase-6-truth-layer` | wrong number footnoted, right one untouched |
| 7 | [phase-07-agent-roas.md](phase-07-agent-roas.md) | `phase-7-agent-roas` | grade in ledger and jev-gateway |
| 8 | [phase-08-surfaces.md](phase-08-surfaces.md) | `phase-8-surfaces` | slash, CLI, superagent compat |
| 9 | [phase-09-capture.md](phase-09-capture.md) | `phase-9-capture` | capture matrix, `/harness` recomputes |
| 10 | [phase-10-tag-witness.md](phase-10-tag-witness.md) | `phase-10-tag-witness` | fixture page: fired and missing tags |
| 11 | [phase-11-desktop.md](phase-11-desktop.md) | `phase-11-desktop` | SDK-only lint, screenshots |
| 12 | [phase-12-submission.md](phase-12-submission.md) | `phase-12-submission` | pack complete; Jordan opens the catalog PR |

## Gate procedure (every phase)

1. Run the phase's gate checks and `just verify`.
2. Write `PLANNING/PHASE-N-COMPLETE.md` (what passed, what didn't, evidence: captured runs, URLs, CI links).
3. Commit on the phase branch as Jordan Hill, push, open a PR into `main` with the PR template.
4. Report, then stop and wait for Jordan.

## Decisions

Architecture decisions live in [decisions/](decisions/), one ADR per file.
