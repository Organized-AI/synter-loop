from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

_SCHEMA_PATH = Path(__file__).parent / "schema" / "events.v1.json"
_SCHEMA = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))
_REQUIRED = tuple(_SCHEMA["required"])
_EVENT_TYPES = frozenset(_SCHEMA["properties"]["event_type"]["enum"])
_EVENT_PAYLOAD_REQUIRED = {
    item["if"]["properties"]["event_type"]["const"]: tuple(
        item["then"]["properties"]["payload"]["required"]
    )
    for item in _SCHEMA["allOf"]
}


def _fail(path: str, message: str) -> None:
    raise ValueError(f"Invalid Synter Loop event at {path}: {message}")


def _is_type(value: Any, expected: str | list[str]) -> bool:
    kinds = [expected] if isinstance(expected, str) else expected
    for kind in kinds:
        if kind == "string" and isinstance(value, str):
            return True
        if kind == "object" and isinstance(value, dict):
            return True
        if kind == "array" and isinstance(value, list):
            return True
        if kind == "boolean" and isinstance(value, bool):
            return True
        if kind == "integer" and isinstance(value, int) and not isinstance(value, bool):
            return True
        if kind == "number" and isinstance(value, (int, float)) and not isinstance(value, bool):
            return True
        if kind == "null" and value is None:
            return True
    return False


def validate_event(event: dict[str, Any]) -> None:
    """Validate the event envelope and conditional requirements in events.v1.json.

    This intentionally implements the schema's small, fixed Draft 2020-12
    subset with the standard library, keeping the local plugin dependency-free.
    """
    if not isinstance(event, dict):
        _fail("<root>", "expected object")
    missing = [key for key in _REQUIRED if key not in event]
    if missing:
        _fail("<root>", f"missing required properties: {', '.join(missing)}")

    allowed = set(_SCHEMA["properties"])
    extra = sorted(set(event) - allowed)
    if extra:
        _fail("<root>", f"additional properties are not allowed: {', '.join(extra)}")

    for key in ("event_id", "event_type", "schema_version", "timestamp", "run_id", "session_id", "turn_id", "harness_variant", "payload"):
        spec = _SCHEMA["properties"][key]
        if "type" in spec and not _is_type(event[key], spec["type"]):
            _fail(key, f"expected {spec['type']}")
        if "enum" in spec and event[key] not in spec["enum"]:
            _fail(key, "value is not in the allowed enum")
        if "const" in spec and event[key] != spec["const"]:
            _fail(key, f"must equal {spec['const']!r}")
        if "minLength" in spec and len(event[key]) < spec["minLength"]:
            _fail(key, f"must contain at least {spec['minLength']} character")
    for key in ("event_id", "run_id"):
        if not event[key]:
            _fail(key, "must be a non-empty string")
    if event["event_type"] not in _EVENT_TYPES:
        _fail("event_type", "unknown event type")
    if isinstance(event["schema_version"], bool) or event["schema_version"] != 1:
        _fail("schema_version", "must equal 1")
    try:
        parsed = datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("timezone required")
    except (ValueError, TypeError, AttributeError):
        _fail("timestamp", "must be a date-time with timezone")

    variant = event["harness_variant"]
    variant_spec = _SCHEMA["properties"]["harness_variant"]
    variant_required = variant_spec["required"]
    missing = [key for key in variant_required if key not in variant]
    if missing:
        _fail("harness_variant", f"missing required properties: {', '.join(missing)}")
    extra_variant = sorted(set(variant) - set(variant_spec["properties"]))
    if extra_variant:
        _fail("harness_variant", f"additional properties are not allowed: {', '.join(extra_variant)}")
    for key, spec in variant_spec["properties"].items():
        if key in variant and not _is_type(variant[key], spec["type"]):
            _fail(f"harness_variant.{key}", f"expected {spec['type']}")
    if any(not isinstance(value, str) for value in variant["skill_versions"].values()):
        _fail("harness_variant.skill_versions", "all values must be strings")

    payload_required = _EVENT_PAYLOAD_REQUIRED.get(event["event_type"], ())
    missing = [key for key in payload_required if key not in event["payload"]]
    if missing:
        _fail("payload", f"missing required properties for {event['event_type']}: {', '.join(missing)}")


def scrub_secrets(value: Any) -> Any:
    """Redact common secret patterns recursively without changing input data."""
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            normalized = str(key).lower().replace("-", "_")
            if any(token in normalized for token in ("api_key", "access_token", "authorization", "password", "secret", "bearer")):
                out[key] = "[REDACTED]"
            else:
                out[key] = scrub_secrets(item)
        return out
    if isinstance(value, list):
        return [scrub_secrets(item) for item in value]
    if isinstance(value, str):
        value = re.sub(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+", r"\1[REDACTED]", value)
        value = re.sub(r"(?i)(api[_-]?key|access[_-]?token|client[_-]?secret|password)(\s*[:=]\s*)[^\s,;]+", r"\1\2[REDACTED]", value)
    return value
