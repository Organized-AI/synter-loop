# Step 0 - Organized Codebase first

## Goal
The repo has the Organized Codebase shape, GitOps like Organized-AI/podcast-agent, and the reading done before any code.

## Deliverables
- [x] `PLANNING/` with one doc per phase, `decisions/`, gate procedure
- [x] `.claude/agents` and `.claude/commands` from the template (verify-build, verify-architecture, impl-agent, review-agent, test-agent; status, verify, commit, review), adapted: no AI-attribution footer, no kata hooks
- [x] `.claude/settings.json` allow / ask / deny permissions
- [x] `CLAUDE.md` pointing to AGENTS.md
- [x] Pi parity: `.pi/settings.json` loads `.claude/commands` as prompt templates; `.pi/prompts/agent-*.md` run the agent files
- [x] `AGENT-HANDOFF/HANDOFF.md`, `ARCHITECTURE/system-design.md`, `justfile`
- [x] `github.com/Organized-AI/synter-loop`: public, MIT, `main` protected by a ruleset (PR required, squash only, no deletion or force push, `PR Gate` required), release tags `v*` immutable
- [x] CI with a single required `PR Gate` job, PR template, CODEOWNERS, dependabot with cooldown

## Reading (done before code)
- Organized Codebase README and BASIC_PROCESS.md, the template's agents and commands
- measurement-first: schema first; capture, replay, change, compare, release; the loop proposes, people decide
- openai-standards: Bearer auth; a relay you own assembles milestones and POSTs ordinary HTTP hits to sGTM (sGTM cannot consume SSE); SSE is the live-view companion; tool calls use the OpenAI shape with `function.arguments` as a JSON string
- Hermes v0.23.0 docs: plugins guide (compat contract, manifest, capabilities), catalog-submission (admission rules 1 to 18), observer-hooks
- Still to read before their phases: browser-provider-plugin (Phase 10), desktop-plugin-sdk (Phase 11), jev-gateway source (Phase 4)
