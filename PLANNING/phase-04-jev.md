# Phase 4 - Jev decision map (decision_model: jev)

Read `/Users/supabowl/jev-gateway` first: endpoints, auth, decision-map format, D1 schema, evidence contract.

## Deliverables
- Plugin-scoped `synter-spend` map on jev-gateway (not a default): fit, trust, plan, pick
- Gate step after tracking: >= pass band -> approval notes "Jev <score> pass"; between bands -> approval with Jev's warning; below warn -> block with Jev's reason. Jev never approves.
- Evidence contract: loop_trigger, loop_detect, loop_score, loop_decision, loop_gate (run_id, model version), mirrored in the ledger
- jev-gateway unreachable -> unscored, still approval, request queued in a local outbox and replayed

## Gate checks
Jev pass / warn / block; jev-gateway down -> unscored + approval + outbox.

## Rules that bite
Never edit jev-gateway from this repo.
