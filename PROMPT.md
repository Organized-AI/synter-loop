# synter-loop build spec

Written for Pi (Claude Opus 5.5) in T3 Code. It also runs unchanged in Claude Code: `claude --dangerously-skip-permissions` from this folder.

Build `synter-loop`: a native Hermes Agent plugin (NousResearch/hermes-agent v0.23.0) that runs a closed loop on ad spend with Synter's cross-platform ad tools. Spend Guard decides, Tag Witness checks tracking in a real browser, Truth Layer checks the numbers, Agent ROAS grades each decision, and Jev (through Jordan's jev-gateway) learns from the grades. Agent runtime capture records every prompt, tool call and token for replay and relays milestones to Jordan's sGTM container. Agent P&L measures the agent like an ad account. It is an entry for the Hermes Agent Plugin Hackathon (closes Wednesday, November 11, 2026, 5PM EST), judged on usefulness, reliability, polish and creativity.

AGENTS.md holds the hard rules. This file is the build order.

## How you're running

- You are Pi in T3 Code, on Jordan's MacBook Pro (`/Users/supabowl/synter-loop`). Pi has no approval prompts, so AGENTS.md is the only guard. Treat its rules as hard limits, not defaults.
- Secrets live in `.env` (gitignored; copy `.env.example`). Load it only in the command that needs it (`set -a; . ./.env; set +a; ...`). Never echo, log or commit a value.
- Synter is available to you through `.pi/mcp.json`, read-only by design: the server is hidden and only read tools are exposed. Use it to inspect tool metadata and record fixtures. Never edit that file to expose a write tool. The plugin calls Synter through its own client, not through Pi.
- Long-running processes (`wrangler dev`, watchers) run in the background; don't block the session on them.

## Hermes environments

- **Dev (this MacBook).** Don't use `~/.local/bin/hermes` (v0.20.0) or `~/.hermes`. Build a pinned install inside the repo:
  `git clone --depth 1 --branch v0.23.0 https://github.com/NousResearch/hermes-agent .hermes-src && uv venv .venv-hermes && uv pip install --python .venv-hermes -e .hermes-src`
  Run it with `HERMES_HOME="$PWD/.hermes-dev" .venv-hermes/bin/hermes ...` so nothing leaks into Jordan's real Hermes home.
- **Live (claws-mac-mini).** `ssh claw@100.82.244.127`. It runs Jordan's production gateway on Hermes v0.18.2. Read-only checks (`hermes --version`, `hermes profile list`, `launchctl list | grep hermes`) are fine at any time. Anything else waits until Jordan says in the chat that he has updated it to v0.23.0 or later. After that, use a new profile named `synter-dev` only: clone the phase branch to `~/src/synter-loop` on that machine and install the plugin into that profile alone. Never edit the other profiles (clipping, cmo, deepseek-harness, gtm-brian, lead-list-lab, orchestrator, qwen, setasmultiagent, tencentdb-august, viral-reels), never restart `ai.hermes.gateway`, and never add a cron job there without Jordan's go-ahead.

## Step 0 - Organized Codebase first

- Pi doesn't have the organized-codebase-applicator skill. Read `/Users/supabowl/organized-codebase` (README, BASIC_PROCESS.md, its agent templates) and mirror it here: `PLANNING/` with one doc per phase below, the template's agent files, and a `CLAUDE.md` that points to AGENTS.md so Claude Code follows the same rules. Make the agent templates usable from Pi too (Pi's `docs/prompt-templates.md` and `docs/skills.md` under its npm install describe how).
- GitOps like Organized-AI/podcast-agent: create `github.com/Organized-AI/synter-loop` with `gh` (public, MIT), protect `main`, add CI, one branch per phase, a PR at each gate, tags at releases.
- Commits are authored and committed as Jordan Hill <jordan@bluehighlightedtext.com>. No Co-Authored-By, Claude-Session or "Generated with" lines anywhere.
- Read before writing code and follow them: https://hub.organizedai.vip/measurement-first/ (schema first; capture, replay, change, compare, release; the loop proposes, people decide) and https://guide.organizedai.vip/organized-harness-rsi/november-2026/openai-standards/ (relay you own, milestones to sGTM over HTTP POST, OpenAI tool-call shape).
- Read the Hermes docs: developer-guide/plugins, plugins/catalog-submission, plugins/public-api, observer-hooks, browser-provider-plugin, desktop-plugin-sdk. The source is in `.hermes-src` once Phase 1 clones it. Import Hermes modules only from the public plugin API list.
- Read the jev-gateway source at `/Users/supabowl/jev-gateway` (endpoints, auth, decision-map format, D1 schema, evidence contract) before Phase 4.

## Phase 0 - Cloudflare Workers (deploy before plugin code)

Account 691fe25d377abac03627d6a88d3eeac9.
- `/site`: Worker with static assets: landing page (the loop animated with GSAP 3.12.5 from cdnjs, install line, demo video from R2 bucket `synter-loop-media`) and a `/live` run view.
- `/capture`: Worker `agent-capture`: POST /v1/events with a bearer token, raw run JSONL to R2 bucket `agent-runs` (one object per turn), run index in D1 `agent_runs`, metadata-only events forwarded to SGTM_ENDPOINT, a feed for `/live`.
- Deploy both to workers.dev and print the URLs.

## Phase 1 - Scaffold + event schema

- `plugin.yaml`: name `synter-loop`, version "0.1.0", requires_hermes ">=0.23.0", requires_env SYNTER_API_KEY (secret). config_schema: max_daily_increase_usd (250), max_change_usd (100), per_platform_caps (map), tracking_gate (true), dry_run_first (true), synter_mcp_url (https://mcp.syntermedia.ai/mcp/), decision_model (none | jev), jev_gateway_url, jev_gateway_token (secret), jev_bands (pass 0.80, warn 0.50), mode (interactive | propose_only), truth_mode (footnote | block), grade_after_days (7), capture (off | metadata | full, default off), capture_endpoint, capture_token (secret), capture_result_cap_chars (4000), witness_backend (kernel | local), holdout_share (0.0, off), holdout_variant (a named earlier harness variant). provides_* lists must equal what register(ctx) registers; a test enforces it.
- `schema/events.v1.json`: JSON Schema for agent_session_start, agent_turn_start, agent_model_call, agent_tool_call, agent_subagent, agent_gate_decision, agent_approval, agent_turn_complete, agent_outcome. Every emitted event is validated against it in tests. Capture to local JSONL in plugin storage from this phase on.
- Dev Hermes: build the pinned install described above.
- CI: install Hermes v0.23.0, run `hermes plugins validate . --install-deps` and pytest; uv `--exclude-newer` for dependency quarantine. Prefer zero runtime deps; any dep gets a floor and an upper bound.

## Phase 2 - Synter client + read tools

- Async Streamable HTTP MCP client to synter_mcp_url, header X-Synter-Key, secrets only through `agent.secret_scope`. Use an existing Hermes core dependency for HTTP/MCP if one exists.
- Tools: synter_status, synter_performance, synter_reconcile (spend reconciliation, attribution, GA4 conversions side by side), synter_find_action (search_actions), synter_tracking_health (pixel/CAPI health + GTM resources).
- Record fixtures from Synter demo mode and Jordan's workspace (read tools only) so all tests run offline.

## Phase 3 - Spend Guard (pre_tool_call)

- Classifier from Synter's tool metadata ([effect=read|write; scope; externalMutation], credits, destructive), cached in plugin storage; also match Synter tools reached through a user-configured Synter MCP server.
- read -> pass. Non-spend write -> approval. Spend-raising write -> caps -> dry-run preview -> cached tracking health -> approval directive showing platform, campaign, before -> after, daily delta.
- Unattended (`cron.execution_identity`) or mode propose_only -> block every write and record a proposal with an id. `/ads freeze` -> block every write this session.
- Fail closed for writes on any Synter error or timeout; answer well inside Hermes's 30-second hook limit. Never auto-approve, never change hook_callback_timeout, never modify arguments.

## Phase 4 - Jev decision map (decision_model: jev)

- Register a plugin-scoped `synter-spend` map on jev-gateway (not a default). It scores fit, trust, plan and pick (one Synter action from search_actions results).
- Gate step after tracking: score >= pass band -> the approval prompt notes "Jev <score> pass"; between bands -> approval with Jev's warning; below the warn band -> block with Jev's reason. Jev never approves.
- Evidence contract: loop_trigger, loop_detect, loop_score, loop_decision, loop_gate, each with run_id and model version, mirrored in the ledger. jev-gateway unreachable -> unscored, still approval, request queued in a local outbox and replayed.

## Phase 5 - Run + ledger

- synter_run (any Synter action; dry_run true by default, live only after approval), synter_plan_reallocation (proposes moves with expected impact and Jev plan score, never applies), synter_ledger.
- post_approval_response records who approved; post_tool_call writes the ledger row and checks Synter get_ad_readback, flagging mismatches.

## Phase 6 - Truth Layer

- pre_llm_call: when the turn asks about performance (decided in code), inject a reconciled table (platform-claimed, GA4, CAPI/sGTM, CRM) with its run_id.
- transform_llm_output: extract numeric claims, check them with Synter angstrom_verify_output against same-run tool outputs, append footnotes like "Meta claims 120 · GA4 71 · CAPI 84 · run <run_id>"; with truth_mode block, replace a wrong number with the checked one and say so. Fixtures: one wrong answer, one correct answer left untouched.

## Phase 7 - Agent ROAS

- Automation blueprint `agent-roas` (nightly): for each approved change older than grade_after_days, measure before and after with Synter measure_incrementality and get_attribution, write the grade to the ledger, send it to jev-gateway as a labeled outcome, emit agent_outcome. Never changes spend.

## Phase 8 - Surfaces + hermes-superagent

- Slash: `/ads`, `/ads apply <id>` (re-runs the full gate with approval), `/ads ledger`, `/ads freeze`, `/ads unfreeze`. CLI: `hermes synter setup | doctor (Synter, jev-gateway, capture, Kernel reachability) | ledger | watch --json | replay <run_id>`.
- `hermes synter watch --json` prints {"items": [...]} with id, title, url, status (open | resolved), detail for pacing problems, tracking breaks, over-cap spend and open proposals.
- Bundled skill `skills/synter-ad-ops/SKILL.md`.
- Compatibility test in CI: hermes-superagent (AirKyzzZ/hermes-superagent, MIT, not vendored) installed as an external package in router/worker/watchdog profiles under the dev HERMES_HOME with a fake model, as its own CI does. The worker's tool policy lets the synter toolset through, a worker write becomes a proposal, both pre_tool_call hooks coexist.
- Live check on claws-mac-mini only after Jordan's go-ahead (see Hermes environments).

## Phase 9 - Agent runtime capture

- Observer hooks: on_session_start, pre_llm_call, pre_api_request, post_api_request, pre_tool_call, post_tool_call, subagent_start, subagent_stop, post_approval_response, post_llm_call, on_session_end. Fast, fail-open, register only what is used.
- capture metadata: IDs, model, tool names, status, token counts (input, output, cache, reasoning), cost_usd, latency, gate decisions, grades. capture full: also user prompts, the system prompt once per session then its hash, completions, tool arguments and results capped at capture_result_cap_chars, all redacted for secrets.
- Relay: event_id = turn or tool-call id, local outbox with retry, POST to capture_endpoint. Tool events use the OpenAI tool-call shape (id, type, function.name, function.arguments as a string).
- The agent-capture Worker forwards metadata only to the Stape sGTM container at https://arxmgigt.usv.stape.io; document the sGTM client, GA4 tag and BigQuery tag setup. Prompts and results never go to GA4.
- `hermes synter replay <run_id>` rebuilds a run from R2 as a pytest fixture.
- Agent P&L: every event carries harness_variant (prompt hash, skill versions, model, plugin version, Jev map version). holdout_share assigns that share of sessions to holdout_variant, fixed per session and recorded. The Worker builds D1 rollups from raw R2 runs: spend (tokens via Hermes pricing + Synter credits), conversions (approved changes, Truth Layer passes, finished tasks), cost per approved change, return on token spend (agent_outcome lift ÷ spend), rule-based path attribution by prompt/skill/tool/model/Jev score, funnel drop-off from turn to grade, and the agent's own tracking QA (schema failures, outbox drops, missing joins). `/harness` prints the report; funnel events also go through sGTM to GA4. It reports and proposes only; a person promotes a variant.

## Phase 10 - Tag Witness

- Browser provider `synter-witness` (Kernel cloud browsers via KERNEL_API_KEY; local Chromium fallback); is_available() makes no network calls; close_session and emergency_cleanup never raise. If Hermes requires `kind: backend` for browser providers, ship it as a second plugin in `/witness` of the same repo with its own catalog entry.
- On session create, attach a CDP listener: window.dataLayer pushes, and requests to Google Tag Manager, GA4 collect, Google Ads, Meta pixel, Reddit and TikTok pixels. transform_tool_result appends a tracking trace to browser results; tool synter_witness_report summarizes a page.
- Fixes go to GTM workspace drafts through Synter's GTM tools; publish_gtm_container is a gated write.

## Phase 11 - Desktop pane (polish)

- `desktop/plugin.js` via the Desktop Plugin SDK only: status-bar spend chip; a page with caps, ledger, Jev scores and grades; an Agent P&L page (cost per approved change, return on token spend, funnel, variant comparison).

## Phase 12 - Submission pack (don't open the catalog PR or post; Jordan does)

- README "What it does on your machine": network calls to Synter; to jev-gateway, Kernel, the capture Worker and sGTM only when enabled; can change live ad spend; full capture stores prompts and tool results; local ledger and outboxes.
- Screenshots, `docs/catalog-entry.yaml` with a SHA placeholder, `docs/hackathon.md` mapping each catalog rule (3, 5, 6, 9, 10, 11, 12, 13, 14, 17) to evidence, PR description draft. Credit hermes-superagent.

## Test matrix (CI)

read passes; under cap -> approval; over cap -> block; broken tracking -> block with fix; cron -> block; freeze -> block; Synter timeout -> block; Jev pass/warn/block; jev-gateway down -> unscored + approval + outbox; propose_only -> proposal, /ads apply -> approval; Truth Layer footnotes a wrong number; Agent ROAS grade lands in ledger and jev-gateway; every event validates against events.v1.json; capture off sends nothing; capture retry leaves no duplicates; GA4 payloads carry no prompt or result text; Tag Witness fixture page reports fired and missing tags; harness_variant on every event; holdout assignment is fixed per session and recorded; /harness numbers recompute exactly from raw R2 runs; capabilities match manifest.

## Phase gates

Work phase by phase. At each gate: run the checks, commit on the phase branch, push, open a PR into main, report what passed and what didn't, then stop and wait for Jordan before the next phase.
