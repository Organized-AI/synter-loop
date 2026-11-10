# Architecture and trust boundaries

## Local-first data path
Hermes observer hooks → validated v1 events → local plugin-data JSONL/outbox → optional authenticated capture Worker → R2 raw runs / D1 index → metadata-only sGTM relay. Local build defaults capture to `off`; no network call is made unless explicitly configured. The capture Worker must not relay prompts/results.

## Decision path
Synter MCP metadata and read-only observations → Spend Guard policy → optional Jev score/evidence → proposal/dry-run → host approval gate. Jev is advisory. The current build does not enable live external mutations; unknown or failed checks fail closed.

## Data boundaries
- Secrets are resolved through Hermes `agent.secret_scope`; they are never persisted in config, URLs, logs, events, fixtures, or browser traces.
- Full capture is opt-in, capped, redacted, locally held, and not forwarded to analytics.
- Event `harness_variant` identifies prompt/skill/model/plugin/Jev versions; holdout assignment is deterministic per session and does not promote variants.
- Tests use synthetic data and local fake servers. No credentials or live account data are needed.

## Runtime boundaries
Plugin imports documented public Hermes APIs only. Worker and native Desktop SDK components remain separate packages. `jev-gateway` and Kernel are adapters with offline fakes until their source/API contracts are available.
