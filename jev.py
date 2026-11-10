from __future__ import annotations

from typing import Any


def decide(score: float | None, bands: dict[str, float], reasons: list[str] | None = None) -> dict[str, Any]:
    """Jev is advisory: pass permits a human approval prompt, never an execution."""
    if score is None:
        return {"status": "unscored", "score": None, "reasons": reasons or ["Jev gateway unavailable"], "authorizes": False}
    score = max(0.0, min(1.0, float(score)))
    passed = float(bands.get("pass", 0.8))
    warned = float(bands.get("warn", 0.5))
    if score >= passed:
        status = "pass"
    elif score >= warned:
        status = "warn"
    else:
        status = "block"
    return {"status": status, "score": score, "reasons": reasons or [], "authorizes": False}


def queue_evidence(data_dir, evidence: dict[str, Any]) -> str:
    """Persist a Jev request locally until its source contract is verified."""
    import hashlib
    import json
    from pathlib import Path
    from .storage import append_jsonl, read_jsonl
    path = Path(data_dir) / "jev-outbox.jsonl"
    key = hashlib.sha256(json.dumps(evidence, sort_keys=True, default=str).encode()).hexdigest()
    if not any(row.get("idempotency_key") == key for row in read_jsonl(path)):
        append_jsonl(path, {"idempotency_key": key, "status": "queued", "evidence": evidence})
    return key
