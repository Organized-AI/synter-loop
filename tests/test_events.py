from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from synter_loop.events import validate_event


def event(kind="agent_turn_start", payload=None):
    payloads = {
        "agent_session_start": {"capture_mode": "off"},
        "agent_turn_start": {"message_hash": "abc"},
        "agent_model_call": {"model": "fixture", "status": "ok", "latency_ms": 2, "input_tokens": 3, "output_tokens": 4, "cached_tokens": 0, "reasoning_tokens": 0, "cost_usd": 0.0},
        "agent_tool_call": {"tool_name": "synter_status", "status": "ok", "latency_ms": 0, "effect": "read"},
        "agent_subagent": {"child_id": "child-1", "status": "stopped"},
        "agent_gate_decision": {"tool_name": "set_budget", "decision": "block", "reasons": ["fixture"]},
        "agent_approval": {"tool_name": "synter_run", "approved": False},
        "agent_turn_complete": {"status": "success", "total_tokens": 7, "cost_usd": 0.0, "latency_ms": 2},
        "agent_outcome": {"proposal_id": "p-1", "grade": "flat", "source": "fixture", "days_after": 7},
    }
    return {"event_id": str(uuid4()), "event_type": kind, "schema_version": 1,
            "timestamp": datetime.now(timezone.utc).isoformat(), "run_id": "r-1", "session_id": "s-1", "turn_id": "t-1",
            "harness_variant": {"prompt_hash": "unavailable", "skill_versions": {"synter-ad-ops": "0.1.0"},
                                "model": "fixture", "plugin_version": "0.1.0", "jev_map_version": None,
                                "holdout": False, "holdout_variant": None}, "payload": payload if payload is not None else payloads[kind]}


@pytest.mark.parametrize("kind", ["agent_session_start", "agent_turn_start", "agent_model_call", "agent_tool_call", "agent_subagent", "agent_gate_decision", "agent_approval", "agent_turn_complete", "agent_outcome"])
def test_all_event_types_validate(kind):
    validate_event(event(kind))


def test_invalid_event_is_rejected():
    value = event()
    value["payload"] = {}
    with pytest.raises(ValueError, match="message_hash"):
        validate_event(value)
