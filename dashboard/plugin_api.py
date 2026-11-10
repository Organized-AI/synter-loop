from __future__ import annotations

import asyncio
import json
import math
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from plugins.plugin_storage import plugin_data_dir

router = APIRouter()
_MAX_READ_BYTES = 8 * 1024 * 1024


def _data_dir() -> Path:
    return Path(plugin_data_dir("synter-loop"))


def _read_jsonl(name: str, limit: int = 10000) -> list[dict[str, Any]]:
    path = _data_dir() / name
    if not path.is_file():
        return []
    row_limit = max(1, min(int(limit), 10000))
    rows: deque[dict[str, Any]] = deque(maxlen=row_limit)
    with path.open("rb") as stream:
        size = path.stat().st_size
        start = max(0, size - _MAX_READ_BYTES)
        if start:
            stream.seek(start)
            stream.readline()  # discard a possibly partial first record
        for raw in stream:
            try:
                value = json.loads(raw)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            if isinstance(value, dict):
                rows.append(value)
    return list(rows)


def _safe_number(value: Any) -> float:
    try:
        number = float(value or 0)
    except (TypeError, ValueError, OverflowError):
        return 0.0
    return number if math.isfinite(number) else 0.0


def _variant_key(event: dict[str, Any]) -> tuple[str, str, str]:
    variant = event.get("harness_variant") or {}
    return (str(variant.get("prompt_hash", "unknown")), str(variant.get("model", "")), str(variant.get("plugin_version", "")))


def _summaries(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str, str], dict[str, Any]] = defaultdict(lambda: {
        "sessions": set(), "turns": 0, "token_cost_usd": 0.0, "approval_signals": set(), "incremental_lift": 0.0, "source_events": 0,
    })
    for event in events:
        key = _variant_key(event)
        row = groups[key]
        row["source_events"] += 1
        if event.get("session_id"):
            row["sessions"].add(event["session_id"])
        payload = event.get("payload") or {}
        kind = event.get("event_type")
        if kind == "agent_turn_complete":
            row["turns"] += 1
            row["token_cost_usd"] += _safe_number(payload.get("cost_usd"))
        elif kind == "agent_approval" and payload.get("approved") is True:
            row["approval_signals"].add(payload.get("proposal_id", event.get("turn_id", event.get("event_id"))))
        elif kind == "agent_outcome":
            row["incremental_lift"] += _safe_number(payload.get("incremental_lift"))
    result = []
    for (prompt_hash, model, version), row in sorted(groups.items()):
        cost = round(row["token_cost_usd"], 6)
        approvals = len(row["approval_signals"])
        lift = round(row["incremental_lift"], 6)
        result.append({
            "prompt_hash": prompt_hash, "model": model, "plugin_version": version,
            "sessions": len(row["sessions"]), "turns": row["turns"], "source_events": row["source_events"],
            "token_cost_usd": cost, "approval_signals": approvals,
            "cost_per_approval_signal_usd": round(cost / approvals, 6) if approvals else None,
            "cost_per_approved_change_usd": None,
            "incremental_lift": lift,
            "return_on_token_spend": round(lift / cost, 6) if cost else None,
            "promotes_variant": False,
        })
    return result


@router.get("/overview")
async def overview():
    events, ledger = await asyncio.gather(asyncio.to_thread(_read_jsonl, "events.jsonl"),
                                          asyncio.to_thread(_read_jsonl, "ledger.jsonl", 1000))
    latest = max((event.get("timestamp", "") for event in events), default=None)
    return {"ok": True, "event_count": len(events), "run_count": len({event.get("run_id") for event in events}),
            "ledger_count": len(ledger), "latest_event_at": latest, "source": "profile-local"}


@router.get("/ledger")
async def ledger(limit: int = 100):
    rows = await asyncio.to_thread(_read_jsonl, "ledger.jsonl", max(1, min(int(limit), 100)))
    safe = []
    for row in rows:
        fields = row.get("fields") or {}
        safe.append({"item_id": row.get("item_id"), "kind": row.get("kind"), "created_at": row.get("created_at"),
                     "status": fields.get("status", "proposal_only"), "external_mutation": fields.get("external_mutation", False)})
    return {"ok": True, "items": safe, "source": "profile-local"}


@router.get("/reports/harness")
async def harness_report():
    events = await asyncio.to_thread(_read_jsonl, "events.jsonl")
    return {"ok": True, "variants": _summaries(events), "promotes_variant": False, "source": "profile-local"}


@router.get("/reports/pnl")
async def pnl_report():
    events = await asyncio.to_thread(_read_jsonl, "events.jsonl")
    rows = _summaries(events)
    return {"ok": True, "variants": rows, "source_events": len(events), "causal_claim": False,
            "note": "Descriptive telemetry only; approval signals do not prove a change was executed, and correlation is not causal evidence."}


@router.get("/health")
async def health():
    path = await asyncio.to_thread(_data_dir)
    return {"ok": True, "storage": "profile-local", "available": path.exists()}
