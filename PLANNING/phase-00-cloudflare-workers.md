# Phase 0 - Cloudflare Workers (deploy before plugin code)

Account `691fe25d377abac03627d6a88d3eeac9`, workers.dev subdomain `jordan-691`.

## Goal
The capture pipeline and the public page exist before any plugin code, so the first plugin run is already measured.

## Deliverables
- `schema/events.v1.json`: the capture envelope and the nine event names. The capture Worker validates against it at ingest (measurement first; see ADR 0001). Phase 1 extends the per-event payloads and adds the Python-side tests.
- `/capture` Worker `agent-capture`
  - `POST /v1/events`, `Authorization: Bearer <CAPTURE_TOKEN>`; body `{"events": [...]}` or JSONL
  - every event validated against `events.v1.json`; one bad event rejects the batch (400, with the failing index and path)
  - raw run JSONL to R2 `agent-runs`, one object per turn: `runs/<run_id>/<turn_id>.jsonl`; merged by `event_id`, so a retried POST never duplicates
  - run index in D1 `agent_runs` (`runs`, `turns`, `feed`, `forwards`); rollups recomputed from turn rows, never incremented
  - metadata-only events (the `content` object removed, plus a deny-list of content keys anywhere) forwarded to `SGTM_ENDPOINT` + `SGTM_PATH` by HTTP POST; off until the sGTM client exists (ADR 0002)
  - feed for `/live`: `GET /v1/feed?after=<seq>` (JSON) and `GET /v1/feed/stream` (SSE, honours `Last-Event-ID`), metadata only
  - `GET /healthz`
- `/site` Worker `synter-loop`
  - static assets: landing page with the loop animated with GSAP 3.12.5 from cdnjs (SRI pinned), the install line, the demo video from R2 `synter-loop-media` (`/media/demo.mp4`, placeholder until Phase 12 uploads it)
  - `/live` run view fed by the capture feed through a service binding (no CORS, no token in the browser)
- Both deployed to workers.dev, URLs printed

## Gate checks
- `npm run typecheck` and `npm test` (vitest in the Workers runtime) green: auth, schema rejection, R2 object per turn, retry without duplicates, rollup exactness, metadata stripping (no prompt or result text in forwarded payloads), feed cursor
- `wrangler deploy --dry-run` for both Workers in CI
- Live smoke against workers.dev with a synthetic run marked `harness_variant.label = "smoke"`: 401 without token, 202 with it, R2 object present, D1 row present, feed shows it, `/live` renders it
- CI `PR Gate` green on the PR

## Rules that bite
- Secrets: `CAPTURE_TOKEN` is generated locally into `.env` and piped to `wrangler secret put`; never printed.
- Nothing here touches ad accounts or GTM. The sGTM relay stays off until Jordan configures the client in Phase 9.
