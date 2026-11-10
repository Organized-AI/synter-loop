from __future__ import annotations

from collections import defaultdict
from typing import Any


def summarize(events: list[dict[str, Any]]) -> dict[str, Any]:
    variants: dict[str, dict[str, Any]] = defaultdict(lambda: {"sessions": set(), "turns": 0, "token_cost_usd": 0.0,
                                                               "approval_signals": set(), "outcome_lift": 0.0,
                                                               "schema_failures": 0, "dropped_outbox": 0})
    for event in events:
        variant = event.get("harness_variant", {})
        key = str(variant.get("prompt_hash", "unknown")) + ":" + str(variant.get("model", "")) + ":" + str(variant.get("plugin_version", ""))
        row = variants[key]
        if event.get("session_id"):
            row["sessions"].add(event["session_id"])
        kind, payload = event.get("event_type"), event.get("payload", {})
        if kind == "agent_turn_complete":
            row["turns"] += 1
            row["token_cost_usd"] += float(payload.get("cost_usd", 0) or 0)
        elif kind == "agent_approval" and payload.get("approved"):
            row["approval_signals"].add(payload.get("proposal_id", event.get("turn_id", event.get("event_id"))))
        elif kind == "agent_outcome":
            row["outcome_lift"] += float(payload.get("incremental_lift", 0) or 0)
        elif kind == "agent_gate_decision" and payload.get("decision") == "schema_failure":
            row["schema_failures"] += 1
        elif kind == "agent_gate_decision" and payload.get("decision") == "outbox_drop":
            row["dropped_outbox"] += 1
    result = []
    for key, row in sorted(variants.items()):
        cost = round(row["token_cost_usd"], 6)
        approvals = len(row["approval_signals"])
        lift = round(row["outcome_lift"], 6)
        result.append({"variant": key, "sessions": len(row["sessions"]), "turns": row["turns"],
                       "token_cost_usd": cost, "approval_signals": approvals,
                       "cost_per_approval_signal_usd": round(cost / approvals, 6) if approvals else None,
                       "cost_per_approved_change_usd": None,
                       "return_on_token_spend": round(lift / cost, 6) if cost else None,
                       "incremental_lift": lift, "schema_failures": row["schema_failures"],
                       "dropped_outbox": row["dropped_outbox"]})
    return {"variants": result, "source_events": len(events), "promotes_variant": False}
