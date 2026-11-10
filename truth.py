from __future__ import annotations

import re
from typing import Any


_PERFORMANCE_TERMS = ("roas", "cpa", "spend", "revenue", "conversion", "performance", "impressions", "clicks", "attribution")
_NUMBER = re.compile(r"(?<![\w.])\d+(?:\.\d+)?%?")


def is_performance_question(text: str) -> bool:
    lowered = text.lower()
    return any(term in lowered for term in _PERFORMANCE_TERMS)


def reconcile_answer(answer: str, evidence: dict[str, Any], *, mode: str = "footnote") -> tuple[str, list[str]]:
    """Annotate only when same-run source figures exist; never invent missing values."""
    if not evidence or not evidence.get("run_id"):
        return answer, []
    sources = evidence.get("sources")
    if not isinstance(sources, dict) or not sources:
        return answer, []
    canonical = {str(name): value for name, value in sources.items() if value is not None}
    footnote = " · ".join(f"{name} {value}" for name, value in canonical.items())
    note = f"[Synter evidence: {footnote} · run {evidence['run_id']}]"
    claims = _NUMBER.findall(answer)
    mismatches = []
    values = {str(v) for v in canonical.values()}
    for claim in claims:
        if claim not in values:
            mismatches.append(claim)
    if not mismatches:
        return answer, []
    if mode == "block":
        corrected = " · ".join(f"{name}: {value}" for name, value in canonical.items())
        return f"I replaced an unsupported performance figure with same-run evidence: {corrected}. Run {evidence['run_id']}.", mismatches
    return f"{answer.rstrip()}\n\n{note}", mismatches
