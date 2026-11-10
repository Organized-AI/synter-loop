from __future__ import annotations

from typing import Any


def grade_change(before: float | None, after: float | None, *, source: str, days_after: int,
                 incremental_spend: float | None = None) -> dict[str, Any]:
    """Transparent descriptive outcome; not a causal estimate or spend recommendation."""
    if before is None or after is None:
        return {"grade": "inconclusive", "incremental_lift": None, "source": source,
                "days_after": max(0, int(days_after)), "evidence_status": "missing_baseline_or_followup",
                "changes_spend": False}
    lift = float(after) - float(before)
    if incremental_spend is not None and float(incremental_spend) > 0:
        return_ratio = lift / float(incremental_spend)
    else:
        return_ratio = None
    return {"grade": "positive" if lift > 0 else "negative" if lift < 0 else "flat",
            "incremental_lift": round(lift, 6), "return_on_spend": round(return_ratio, 6) if return_ratio is not None else None,
            "source": source, "days_after": max(0, int(days_after)), "evidence_status": "descriptive_not_causal",
            "changes_spend": False}
