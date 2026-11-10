# Phase 11 - Desktop pane (polish)

Read `developer-guide/desktop-plugin-sdk.md` first.

## Deliverables
`desktop/plugin.js` via the Desktop Plugin SDK only: status-bar spend chip; a page with caps, ledger, Jev scores and grades; an Agent P&L page (cost per approved change, return on token spend, funnel, variant comparison).

## Gate checks
`hermes plugins validate` desktop surface check passes; screenshots in light and dark.

## Rules that bite
Catalog rule 8: SDK only, no markup reach-ins, no eval, no dynamic imports.
