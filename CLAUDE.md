# synter-loop

Claude Code, Pi and any other agent working in this repo follow the same rules.

1. Read [`AGENTS.md`](AGENTS.md) first. Its rules are hard limits, not defaults.
2. Read [`PROMPT.md`](PROMPT.md) before any work. It is the build order.
3. Find the current phase in [`AGENT-HANDOFF/HANDOFF.md`](AGENT-HANDOFF/HANDOFF.md) and its plan in [`PLANNING/`](PLANNING/README.md).

This file does not restate the rules, so it cannot drift from them.

## Project structure

```
AGENTS.md            hard rules (authoritative)
PROMPT.md            build spec and phase order
PLANNING/            one doc per phase, decisions/ (ADRs), PHASE-N-COMPLETE.md at each gate
AGENT-HANDOFF/       current state and the next gate
ARCHITECTURE/        system design
schema/              events.v1.json, the capture contract (measurement first)
site/                Cloudflare Worker: landing page and /live run view
capture/             Cloudflare Worker: agent-capture (R2 runs, D1 index, sGTM relay, live feed)
scripts/             repo guards and helpers
.claude/             Claude Code agents, commands, settings
.pi/                 Pi settings, prompt templates, read-only Synter MCP
```

## Verification

Run `just verify` (or `npm run verify`) before every commit. A phase is done only when its gate checks in `PLANNING/phase-NN-*.md` pass and are recorded in `PLANNING/PHASE-N-COMPLETE.md`.

## Do not

- Do not add AI attribution to commits, PRs or files (AGENTS.md rule 1). The template's `/commit` footer was removed on purpose.
- Do not edit `.pi/mcp.json` to expose a Synter write tool (AGENTS.md rule 10).
- Do not touch claws-mac-mini beyond read-only checks until Jordan says so in the chat.
- Do not print, echo or commit a secret. Load `.env` only inside the command that needs it.
- Do not write time estimates in plans or docs.
