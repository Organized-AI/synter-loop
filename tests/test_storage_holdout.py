from pathlib import Path

from synter_loop.holdout import assign_holdout
from synter_loop.storage import EventRecorder, LocalLedger, read_jsonl


def test_event_recorder_writes_valid_private_jsonl(tmp_path: Path):
    recorder = EventRecorder(tmp_path, capture_mode="off", holdout_share=0.5, holdout_variant="previous")
    first = recorder.emit("agent_turn_start", {"message_hash": "x"}, session_id="session-a", turn_id="turn-a")
    second = recorder.emit("agent_turn_start", {"message_hash": "x"}, session_id="session-a", turn_id="turn-b")
    assert first["harness_variant"]["holdout"] == second["harness_variant"]["holdout"]
    assert read_jsonl(tmp_path / "events.jsonl") == [first, second]
    assert (tmp_path / "events.jsonl").stat().st_mode & 0o777 == 0o600


def test_ledger_deduplicates_proposals(tmp_path):
    ledger = LocalLedger(tmp_path)
    one = ledger.record("proposal", {"action": "raise_budget"}, item_id="proposal-1")
    two = ledger.record("proposal", {"action": "different"}, item_id="proposal-1")
    assert one == two
    assert ledger.list() == [one]


def test_holdout_is_fixed_and_clamped():
    assert not assign_holdout("s", 0)
    assert assign_holdout("s", 1)
    assert assign_holdout("s", 0.4) == assign_holdout("s", 0.4)
