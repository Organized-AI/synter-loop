# Phase 8 - Surfaces + hermes-superagent

## Deliverables
- Slash: `/ads`, `/ads apply <id>` (re-runs the full gate with approval), `/ads ledger`, `/ads freeze`, `/ads unfreeze`
- CLI: `hermes synter setup | doctor | ledger | watch --json | replay <run_id>`; `watch --json` prints `{"items": [...]}` (id, title, url, status open|resolved, detail)
- Bundled skill `skills/synter-ad-ops/SKILL.md`
- CI compat: hermes-superagent installed as an external package (router / worker / watchdog profiles, fake model) under the dev HERMES_HOME; the worker's tool policy lets the synter toolset through; a worker write becomes a proposal; both `pre_tool_call` hooks coexist
- Live check on claws-mac-mini only after Jordan's go-ahead (`synter-dev` profile only)

## Rules that bite
Rule 7: never vendor, copy or fork hermes-superagent.
