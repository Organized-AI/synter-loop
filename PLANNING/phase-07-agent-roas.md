# Phase 7 - Agent ROAS

## Deliverables
- Automation blueprint `agent-roas` (nightly): for each approved change older than `grade_after_days`, measure before and after with Synter `measure_incrementality` and `get_attribution`, write the grade to the ledger, send it to jev-gateway as a labeled outcome, emit `agent_outcome`. Never changes spend.

## Gate checks
Grade lands in the ledger and in jev-gateway (fixture); `agent_outcome` validates.

## Rules that bite
No cron job on claws-mac-mini without Jordan's go-ahead.
