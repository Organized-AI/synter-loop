# Phase 10 - Tag Witness

Read `developer-guide/browser-provider-plugin.md` first.

## Deliverables
- Browser provider `synter-witness` (Kernel via KERNEL_API_KEY; local Chromium fallback); `is_available()` makes no network calls; `close_session` and `emergency_cleanup` never raise. If Hermes requires `kind: backend`, ship it as a second plugin in `/witness` with its own catalog entry.
- CDP listener on session create: `window.dataLayer` pushes and requests to GTM, GA4 collect, Google Ads, Meta, Reddit, TikTok pixels
- `transform_tool_result` appends a tracking trace to browser results; `synter_witness_report` summarizes a page
- Fixes go to GTM workspace drafts through Synter; `publish_gtm_container` is a gated write

## Gate checks
Fixture page reports fired and missing tags.
