# Phase 0 complete: Cloudflare Workers (with Step 0)

Branch `phase-0-cloudflare`. Gate reached; waiting for Jordan.

## Deployed

| Worker | URL | Version |
|---|---|---|
| `agent-capture` | https://agent-capture.jordan-691.workers.dev | `23abab5c-abf5-4366-8f3f-fd750a2c5ef5` |
| `synter-loop` (site) | https://synter-loop.jordan-691.workers.dev | `dd2998b8-f3d7-4919-9b38-212998ace8ff` |

Resources created in account `691fe25d377abac03627d6a88d3eeac9`: R2 `agent-runs`, R2 `synter-loop-media`, D1 `agent_runs` (`11f00ae9-c452-422e-97a4-91e23121b163`, migration `0001_agent_runs.sql` applied), Worker secret `CAPTURE_TOKEN`.

## Gate checks

| Check | Result | Evidence |
|---|---|---|
| Repo guards (rules 1, 4, 10; catalog 17) | PASS | `npm run guards` |
| Typecheck (TypeScript 7.0.2, strict) | PASS | `npm run typecheck` |
| capture tests, Workers runtime | PASS 27/27 | `vitest run -c capture/vitest.config.ts` |
| site tests, Workers runtime | PASS 5/5 | `vitest run -c site/vitest.config.ts` |
| Bundle both Workers | PASS | `wrangler deploy --dry-run` x2 |
| Live smoke | PASS 15/15 | `just smoke`, run `smoke_20261107132152626` |
| R2 object per turn | PASS | `agent-runs/runs/smoke_20261107132152626/smoke_20261107132152626_t1.jsonl`, 5 lines |
| sGTM relay off, decision recorded per event | PASS | D1 `forwards`: 6 rows `skipped` |
| CI `PR Gate` on PR #1 | PASS | [run 42376797663](https://github.com/Organized-AI/synter-loop/actions/runs/42376797663): guards, gitleaks (full history), workers |

Test-matrix rows covered here: every event validates against `events.v1.json` (ingest rejects the batch otherwise); capture retry leaves no duplicates; GA4/sGTM payloads carry no prompt or result text; rollups recompute exactly from raw R2 objects.

## Decisions

- [ADR 0001](decisions/0001-schema-before-capture.md): `schema/events.v1.json` ships now, because the capture Worker validates against it at ingest (AGENTS.md rule 6). Phase 1 extends `data` additively.
- [ADR 0002](decisions/0002-sgtm-relay-off-until-client.md): the sGTM relay is built and tested but deployed with `SGTM_FORWARD=off` until the Stape client exists (Phase 9), so smoke runs never reach GA4.

## Not done / follow-ups

- Demo video: `/media/demo.mp4` returns 404 and the page shows a placeholder until Phase 12 uploads it.
- The `/live` feed is public and metadata only (`FEED_PUBLIC=on`). Set it to `off` if runs should be private; the site would then need a feed token.
- Synter MCP for Pi does not connect: Keychain item `synter-api-key` is not set. Needed from Phase 2.
- The landing page was checked over HTTP (status, CSP, GSAP SRI tag, install line), not visually in a browser.
- CI's first run flagged GitHub's synthetic PR merge commit as a non-Jordan author; the guard now skips merge commits (`--no-merges`).
- `wrangler` OAuth lacks some optional scopes (it warns); everything Phase 0 needed (Workers, R2, D1) worked.
