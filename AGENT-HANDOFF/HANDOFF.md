# Handoff

## Where things stand

- Current phase: **Phase 0 - Cloudflare Workers**, gate reached on branch `phase-0-cloudflare`. Waiting for Jordan.
- Step 0 shipped with it (Organized Codebase structure, GitOps, CI).
- Next: Phase 1 (scaffold + schema extension + pinned dev Hermes) on `phase-1-scaffold`, only after Jordan says go.

## Facts the next session needs

- Repo: https://github.com/Organized-AI/synter-loop (public, MIT). `main` ruleset: PR required, squash only, no force push or deletion, `PR Gate` required. Tags `v*` immutable.
- Workers: `agent-capture` at https://agent-capture.jordan-691.workers.dev, `synter-loop` at https://synter-loop.jordan-691.workers.dev.
- D1 `agent_runs` id `11f00ae9-c452-422e-97a4-91e23121b163`; R2 `agent-runs`, `synter-loop-media`.
- `CAPTURE_TOKEN` lives in `.env` (mode 600) and as a Worker secret. `.env` placeholder lines are commented out because Wrangler 4 reads `.env` itself.
- sGTM relay is `SGTM_FORWARD=off` until the Stape client exists (ADR 0002).
- `.hermes-src` (v0.23.0, gitignored) is already cloned for reading docs; Phase 1 builds `.venv-hermes` from it.
- npm 10.9.8 at `~/.local/bin/npm` crashes in arborist when resolving this tree; `npx npm@11 install` works, and plain `npm ci` from the lock works on npm 10.
- Synter MCP for Pi: Keychain item `synter-api-key` is not set yet, so the server does not connect. Not needed until Phase 2 fixtures.
- claws-mac-mini: Hermes v0.18.2 (`~/.local/bin/hermes`, not on the non-login ssh PATH). Read-only until Jordan updates it.
