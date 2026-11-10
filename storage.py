from __future__ import annotations

import fcntl
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .events import scrub_secrets, validate_event


def append_jsonl(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        os.chmod(path.parent, 0o700)
    except OSError:
        pass
    data = (json.dumps(row, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()
    fd = os.open(path, os.O_CREAT | os.O_APPEND | os.O_WRONLY, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        os.write(fd, data)
        os.fsync(fd)
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
                if isinstance(value, dict):
                    rows.append(value)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Corrupt JSONL at {path.name}:{line_number}") from exc
    return rows


class EventRecorder:
    def __init__(self, data_dir: Path, *, capture_mode: str = "off", holdout_share: float = 0.0,
                 holdout_variant: str = "", model: str = "", jev_map_version: str | None = None):
        self.data_dir = Path(data_dir)
        self.capture_mode = capture_mode if capture_mode in {"off", "metadata", "full"} else "off"
        self.holdout_share = max(0.0, min(1.0, float(holdout_share)))
        self.holdout_variant = holdout_variant or None
        self.model = model
        self.jev_map_version = jev_map_version

    def _variant(self, session_id: str | None) -> dict[str, Any]:
        from .holdout import assign_holdout
        holdout = assign_holdout(session_id or "no-session", self.holdout_share)
        return {
            "prompt_hash": "unavailable",
            "skill_versions": {"synter-ad-ops": "0.1.0"},
            "model": self.model,
            "plugin_version": "0.1.0",
            "jev_map_version": self.jev_map_version,
            "holdout": holdout,
            "holdout_variant": self.holdout_variant if holdout else None,
        }

    def emit(self, event_type: str, payload: dict[str, Any], *, run_id: str | None = None,
             session_id: str | None = None, turn_id: str | None = None) -> dict[str, Any]:
        event = {
            "event_id": str(uuid.uuid4()),
            "event_type": event_type,
            "schema_version": 1,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "run_id": run_id or session_id or str(uuid.uuid4()),
            "session_id": session_id,
            "turn_id": turn_id,
            "harness_variant": self._variant(session_id),
            "payload": scrub_secrets(payload),
        }
        validate_event(event)
        append_jsonl(self.data_dir / "events.jsonl", event)
        return event


class LocalLedger:
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.path = self.data_dir / "ledger.jsonl"

    def record(self, kind: str, fields: dict[str, Any], *, item_id: str | None = None) -> dict[str, Any]:
        rows = read_jsonl(self.path)
        key = item_id or str(uuid.uuid4())
        if any(row.get("item_id") == key for row in rows):
            return next(row for row in rows if row.get("item_id") == key)
        row = {"item_id": key, "kind": kind, "created_at": datetime.now(timezone.utc).isoformat(),
               "fields": scrub_secrets(fields)}
        append_jsonl(self.path, row)
        return row

    def list(self, limit: int = 100) -> list[dict[str, Any]]:
        return read_jsonl(self.path)[-max(1, min(int(limit), 1000)):]
