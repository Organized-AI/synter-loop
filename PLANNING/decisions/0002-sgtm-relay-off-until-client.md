# ADR 0002 - The sGTM relay is built in Phase 0 and switched off until Phase 9

Status: accepted (Phase 0)

## Context
`agent-capture` forwards metadata-only events to Jordan's Stape sGTM container. No sGTM client claims those requests yet, and the container feeds production GA4.

## Decision
The relay code ships and is tested in Phase 0 (metadata stripping, one POST per event, status recorded in D1 `forwards`). It is controlled by the `SGTM_FORWARD` var, deployed as `"off"`. Phase 9 documents the sGTM client, GA4 tag and BigQuery tag, and Jordan switches it on.

## Consequences
Smoke-test events from Phase 0 never reach GA4. Forward status rows (`skipped`) show the relay ran its decision for every event.
