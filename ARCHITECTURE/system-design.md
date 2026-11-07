# System design

```
                       Hermes Agent (v0.23.0+) with the synter-loop plugin
 +-----------------------------------------------------------------------------------+
 |  pre_llm_call ── Truth Layer (reconciled table in)                                 |
 |  pre_tool_call ─ Spend Guard: classify -> caps -> dry run -> tracking -> Jev -> ask |
 |  transform_llm_output ─ Truth Layer (numbers checked, footnotes out)               |
 |  browser provider ─ Tag Witness (CDP: dataLayer, fired tags)                       |
 |  automation blueprint ─ Agent ROAS (nightly grades, never spends)                  |
 |  observer hooks ─ capture (metadata | full) -> local outbox -> relay              |
 +------------------------+----------------------+-------------------+----------------+
                          |                      |                   |
                Synter MCP (X-Synter-Key)   jev-gateway        agent-capture Worker
                every connected platform    (synter-spend map)  POST /v1/events (Bearer)
                                                                     |
                     +-----------------------+-----------------------+-------------------+
                     |                       |                       |                   |
               R2 agent-runs           D1 agent_runs          sGTM (Stape), metadata   /v1/feed (+SSE)
               runs/<run>/<turn>.jsonl runs, turns, feed,     only, one POST per        metadata only
               full capture            forwards               milestone (off until      |
                                                              Phase 9, ADR 0002)        site Worker /live
```

## Contracts

- **Events**: `schema/events.v1.json`. Metadata outside `content`, full-capture text inside it. Deterministic `event_id` so retries dedupe.
- **Capture store**: one R2 object per turn, merged by `event_id` with etag-conditional writes. D1 rollups are recomputed from source rows, never incremented.
- **Relay to sGTM**: ordinary HTTP POSTs of metadata-only events; status recorded per event in `forwards`.
- **Live view**: the site Worker reaches agent-capture over a service binding, forwards no visitor credentials, and renders feed values with `textContent` only.

## Deployed (Phase 0)

| Worker | URL | Bindings |
|---|---|---|
| `agent-capture` | https://agent-capture.jordan-691.workers.dev | D1 `agent_runs`, R2 `agent-runs`, secret `CAPTURE_TOKEN` |
| `synter-loop` | https://synter-loop.jordan-691.workers.dev | assets, service `agent-capture`, R2 `synter-loop-media` |
