# Phase 6 - Truth Layer

## Deliverables
- `pre_llm_call`: when the turn asks about performance (decided in code), inject a reconciled table (platform-claimed, GA4, CAPI/sGTM, CRM) with its run_id
- `transform_llm_output`: extract numeric claims, check with Synter `angstrom_verify_output` against same-run tool outputs, append footnotes like "Meta claims 120 · GA4 71 · CAPI 84 · run <run_id>"; `truth_mode: block` replaces a wrong number and says so

## Gate checks
Fixtures: one wrong answer footnoted (and replaced in block mode), one correct answer left untouched.
