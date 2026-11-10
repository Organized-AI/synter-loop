# Phase 5 - Run + ledger

## Deliverables
- `synter_run` (any Synter action; dry_run true by default, live only after approval)
- `synter_plan_reallocation` (proposes moves with expected impact and Jev plan score, never applies)
- `synter_ledger`
- `post_approval_response` records who approved; `post_tool_call` writes the ledger row and checks Synter `get_ad_readback`, flagging mismatches

## Gate checks
Ledger row per approved change; readback mismatch flagged on a fixture; dry run is the default path.

## Rules that bite
Rule 3: dry runs and fixtures only unless Jordan approves the exact action in the chat.
