from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx

from .events import scrub_secrets
from .storage import append_jsonl, read_jsonl

_PRIVATE_KEYS = {"prompt", "user_message", "system_prompt", "completion", "assistant_response", "result", "tool_result", "arguments", "content", "body", "raw_url"}


def metadata_projection(value: Any) -> Any:
    if isinstance(value, dict):
        projected = {}
        for key, item in value.items():
            normalized = str(key).lower()
            if normalized == "arguments":
                projected[key] = "{}"  # preserve the OpenAI tool-call shape without leaking arguments
            elif normalized not in _PRIVATE_KEYS:
                projected[key] = metadata_projection(item)
        return projected
    if isinstance(value, list):
        return [metadata_projection(item) for item in value]
    return value


def bounded_full_projection(value: Any, cap_chars: int = 4000) -> Any:
    cap = max(0, min(int(cap_chars), 40_000))
    if isinstance(value, dict):
        return {key: bounded_full_projection(item, cap) for key, item in value.items()}
    if isinstance(value, list):
        return [bounded_full_projection(item, cap) for item in value]
    if isinstance(value, str):
        return value[:cap]
    return value


class TurnOutbox:
    """Append-only, idempotent turn outbox. `flush` is a no-op in capture=off."""
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.pending_path = self.data_dir / "capture-outbox.jsonl"
        self.status_path = self.data_dir / "capture-outbox-status.jsonl"

    def enqueue(self, turn_key: str, events: list[dict[str, Any]], *, mode: str, cap_chars: int = 4000) -> bool:
        if mode == "off" or not turn_key:
            return False
        existing = {row.get("turn_key") for row in read_jsonl(self.pending_path)}
        if turn_key in existing:
            return False
        cleaned = metadata_projection(events) if mode == "metadata" else bounded_full_projection(scrub_secrets(events), cap_chars)
        append_jsonl(self.pending_path, {"turn_key": turn_key, "mode": mode, "events": cleaned})
        return True

    def flush(self, endpoint: str, token: str, *, mode: str = "off", timeout: float = 8.0) -> dict[str, Any]:
        if mode == "off":
            return {"sent": 0, "pending": 0, "disabled": True}
        if not endpoint or not token:
            return {"sent": 0, "pending": len(read_jsonl(self.pending_path)), "error": "capture endpoint/token missing"}
        parts = urlsplit(endpoint)
        if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
            return {"sent": 0, "pending": len(read_jsonl(self.pending_path)), "error": "capture endpoint must be HTTPS"}
        sent_ids = {row.get("turn_key") for row in read_jsonl(self.status_path) if row.get("status") == "sent"}
        pending = [row for row in read_jsonl(self.pending_path) if row.get("turn_key") not in sent_ids]
        sent = 0
        for row in pending:
            try:
                response = httpx.post(endpoint, json={"run_id": row["turn_key"], "turn_id": row["turn_key"], "events": row["events"]},
                                      headers={"Authorization": f"Bearer {token}", "Idempotency-Key": row["turn_key"]},
                                      timeout=timeout, follow_redirects=False)
                if response.status_code < 300:
                    append_jsonl(self.status_path, {"turn_key": row["turn_key"], "status": "sent"})
                    sent += 1
                else:
                    append_jsonl(self.status_path, {"turn_key": row["turn_key"], "status": "failed", "http_status": response.status_code})
            except httpx.HTTPError as exc:
                append_jsonl(self.status_path, {"turn_key": row["turn_key"], "status": "failed", "error_type": type(exc).__name__})
        return {"sent": sent, "pending": len(pending) - sent, "disabled": False}
