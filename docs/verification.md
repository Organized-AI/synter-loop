# Local verification record

## Tool-backed checks
- Hermes Agent v0.23.0 plugin validator passed against a source-only copy: manifest/config, isolated `register()` capability probe, declared tools/hooks/middleware, security scan, no core override, and desktop SDK surface all passed.
- Python standard-library smoke suite: **7 tests passed**. Covers event validation/recording, write fail-closed behavior, proposal-only ledger/reporting, metadata redaction and off-box capture disabled, plugin registration, and aggregate-only dashboard endpoints.
- Capture Worker Node tests: **7 passed, 0 failed**; includes fixture schema, auth rejection, metadata allow-listing, R2 idempotency, ingest, and read-only index API.
- `compileall` and `node --check` passed for Python, Worker, and browser assets.
- Wrangler 4.79.0 `--dry-run` bundle checks passed for both Workers: capture bundle 13.96 KiB (4.30 KiB gzip); site bundle 2.22 KiB (0.88 KiB gzip). Dry-run only; no deployment or resource provisioning.
- Dashboard reporting distinguishes approval signals from executed changes; `cost_per_approved_change_usd` remains null because this local build does not execute or verify external writes.

## Not verified / release boundaries
- The extended pytest suite was not run because its optional test dependencies are not installed; no dependency installation was attempted.
- No Synter, Jev, Kernel, or sGTM live calls; no ad-account/GTM writes; no Cloudflare deployment or provisioning.
- The GitHub `main` branch is still the bootstrap/build-spec commit; installations must pin the published feature-branch commit rather than use the unqualified repository shorthand.
- Authorized publication scope is the feature branch/PR and install into the isolated `synter-dev` profile under `.hermes-dev`. The PR is not merged; the plugin remains disabled unless separately requested.
- No catalog submission, production Hermes profile changes, Worker deployment/provisioning, or live Synter/Jev/Kernel/sGTM/ad-account/GTM operations.
