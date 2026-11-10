from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

READ_HINTS = ("status", "overview", "performance", "report", "reconcile", "search", "list", "get", "fetch", "tracking", "health", "inspect", "verify")
WRITE_HINTS = ("set", "update", "create", "delete", "publish", "launch", "apply", "budget", "spend", "campaign", "pause", "resume", "write", "activate", "deploy", "edit")


def classify_effect(tool_name: str, metadata: dict[str, Any] | None = None) -> str:
    """Return read/write/unknown; provider metadata wins, ambiguous tools fail closed."""
    metadata = metadata or {}
    effect = str(metadata.get("effect", "")).lower()
    if effect in {"read", "write"}:
        if metadata.get("externalMutation") is True:
            return "write"
        return effect
    if metadata.get("externalMutation") is True or metadata.get("destructive") is True:
        return "write"
    name = tool_name.lower().replace("-", "_")
    if any(part in name for part in WRITE_HINTS):
        return "write"
    if any(part in name for part in READ_HINTS):
        return "read"
    return "unknown"


@dataclass(frozen=True)
class GateDecision:
    decision: str
    reasons: tuple[str, ...]
    requires_approval: bool = False

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def evaluate_write(*, tool_name: str, effect: str, delta_usd: float = 0.0,
                   daily_after_usd: float | None = None, platform: str = "",
                   platform_after_usd: float | None = None, tracking_ok: bool | None = None,
                   tracking_gate: bool = True, frozen: bool = False, unattended: bool = False,
                   mode: str = "propose_only", max_change_usd: float = 100.0,
                   max_daily_increase_usd: float = 250.0,
                   platform_caps: dict[str, float] | None = None,
                   synter_ok: bool = True, dry_run_first: bool = True) -> GateDecision:
    reasons: list[str] = []
    if effect == "read":
        return GateDecision("pass", ())
    if effect != "write":
        return GateDecision("block", ("unknown effect; fail closed",))
    if frozen:
        return GateDecision("block", ("session freeze is active",))
    if unattended:
        return GateDecision("proposal", ("unattended execution cannot mutate external spend",))
    if mode == "propose_only":
        return GateDecision("proposal", ("mode is propose_only",))
    if not synter_ok:
        return GateDecision("block", ("Synter evidence unavailable or timed out",))
    if tracking_gate and tracking_ok is not True:
        return GateDecision("block", ("tracking health is missing or unhealthy",))
    if abs(float(delta_usd)) > max(0.0, float(max_change_usd)):
        return GateDecision("block", ("single-change cap exceeded",))
    if daily_after_usd is not None and daily_after_usd > max(0.0, float(max_daily_increase_usd)):
        return GateDecision("block", ("daily increase cap exceeded",))
    cap = (platform_caps or {}).get(platform)
    if cap is not None and platform_after_usd is not None and platform_after_usd > float(cap):
        return GateDecision("block", (f"{platform} platform cap exceeded",))
    if dry_run_first:
        reasons.append("dry-run preview required before approval")
    reasons.append("explicit human approval required; this decision is not authorization")
    return GateDecision("approval", tuple(reasons), requires_approval=True)
