# Synter Loop

**Evidence-gated, local-first Synter ad operations for Hermes Agent.** It offers read-only performance/reconciliation/tracking checks, records dry-run proposals, guards Synter-tagged write tools, and keeps replayable, schema-validated telemetry in profile-scoped local storage.

## What it does on your machine
- Reads campaign information only when a user calls a read tool and the profile's `SYNTER_API_KEY` is available through Hermes secret scope.
- Saves event and proposal JSONL under this plugin's Hermes profile data directory (mode 0700/0600 where supported).
- Can optionally send event batches to a configured capture Worker only when `capture` is `metadata` or `full`, endpoint and token are configured, and a turn finishes. `capture: off` is the default and sends nothing.
- `full` capture may store user/assistant text and tool results locally and in your Worker bucket; values are redacted where recognizable and capped. Do not enable it for sensitive conversations unless you accept that storage.
- This local build does **not** execute Synter writes, change budgets, launch campaigns, publish GTM, deploy Workers, or promote a harness variant. `/ads apply` and `synter_run` with `dry_run=false` are blocked.
- Jev and Kernel integration points are offline adapters until their source/API contract and credentials are supplied and reviewed. Scores never authorize actions.

## Development and offline verification
- Uses the pinned Hermes v0.23.0 source and isolated `.hermes-dev` home in this checkout.
- Dependency-free Python smoke checks: `.venv-hermes/bin/python -m unittest discover -s tests -p 'test_*smoke.py' -v`.
- Capture Worker tests: `(cd workers && node --test)`; JavaScript syntax: `node --check` on the Worker and browser assets.
- Local Cloudflare bundling only: `wrangler deploy --dry-run --outdir /tmp/synter-loop-build --config <worker>/wrangler.toml`. This does not deploy or provision resources.
- Hermes catalog validation: run `hermes plugins validate` against a source-only copy of this directory (exclude `.git`, `.hermes-src`, `.venv-hermes`, `.hermes-dev`, caches, and `.env`).
- The extended pytest suite is optional and requires the `test` extra; all fixtures are synthetic and no production keys/account data are required.

## Data and network boundaries
Synter requests go to the configured Synter MCP HTTPS endpoint with `X-Synter-Key`. Capture uses HTTPS bearer auth only when enabled. sGTM receives metadata only; prompts/results never go to GA4. The Worker should keep raw run JSONL in R2 and only a redacted run index in D1.

## Build status
See `PLANNING/README.md` and the phase documents. Public deployment, GitHub writes/PRs, catalog submission, production Hermes install/restart, and live account operations are separate release actions.
