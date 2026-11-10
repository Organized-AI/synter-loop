# Agent capture Worker

Local-first ingestion endpoint for Hermes Synter Loop events. Cloudflare deployments are deliberately not part of the build task.

## Storage contract

- `POST /v1/events` requires `Authorization: Bearer $CAPTURE_TOKEN` and an `application/json` batch (`[{...event}]` or `{events:[...]}`). Maximum: 1 MB request, 250 KB encoded event batch, 100 events.
- Validated events are appended to one JSONL R2 object per run/turn at `runs/<run_id>/<turn_id>.jsonl` (`turn_id=null` maps to `session`). Retrying the same `event_id` and content is idempotent; reusing an ID with different content returns 409.
- D1 stores only the run/event index (IDs, type, timestamps, model/plugin version, holdout flag). It never stores prompt/result payloads.
- `GET /live` returns the sanitized D1 run index; `GET /health` is a shallow liveness check.
- Optional sGTM forwarding is disabled unless `SGTM_FORWARD=true` and an HTTPS `SGTM_ENDPOINT` are configured. It sends an explicit metadata allow-list only; prompt, response, result, arguments, and arbitrary payload keys cannot pass through.

## Local development

1. Create a local random token and put it in `.dev.vars` (copy `.dev.vars.example`; do not commit it).
2. Create local resources without remote flags:
   - `wrangler d1 migrations apply synter-loop-index --local --config agent-capture/wrangler.toml`
   - Start `wrangler dev --config agent-capture/wrangler.toml --port 8787`
3. Exercise only synthetic events with `workers/test/fixtures/event.json`.

Do not use `--remote`, deploy, or configure a production endpoint during local tests. R2 read/modify/write is idempotent for retries; callers should batch a single turn and avoid concurrent writes to the same run/turn key.
