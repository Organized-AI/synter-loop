from __future__ import annotations

import hashlib


def assign_holdout(session_id: str, share: float) -> bool:
    """Deterministic cohort membership: a session never changes arms on replay."""
    share = max(0.0, min(1.0, float(share)))
    if share <= 0.0:
        return False
    if share >= 1.0:
        return True
    bucket = int.from_bytes(hashlib.sha256(session_id.encode("utf-8")).digest()[:8], "big") / 2**64
    return bucket < share
