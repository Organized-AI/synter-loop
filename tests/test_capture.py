from synter_loop.capture import TurnOutbox, metadata_projection
from synter_loop.storage import read_jsonl


def test_capture_off_is_noop_and_metadata_redacts_text(tmp_path):
    outbox = TurnOutbox(tmp_path)
    event = {"event_id": "1", "payload": {"tool_name": "synter_status", "result": "private", "openai_tool_call": {"type": "function", "function": {"name": "search", "arguments": "{\"customer\":\"private\"}"}}}}
    assert not outbox.enqueue("turn-a", [event], mode="off")
    assert outbox.flush("https://capture.invalid/v1/events", "never-used", mode="off")["disabled"]
    assert read_jsonl(tmp_path / "capture-outbox.jsonl") == []
    assert outbox.enqueue("turn-a", [event], mode="metadata")
    assert not outbox.enqueue("turn-a", [event], mode="metadata")
    stored = read_jsonl(tmp_path / "capture-outbox.jsonl")[0]["events"][0]
    assert "result" not in stored["payload"]
    call = stored["payload"]["openai_tool_call"]
    assert call["function"]["arguments"] == "{}"


def test_metadata_projection_drops_prompts_and_keeps_shape():
    projected = metadata_projection({"prompt": "private", "tool_call": {"type": "function", "function": {"name": "x", "arguments": "secret"}}})
    assert "prompt" not in projected
    assert projected["tool_call"]["function"] == {"name": "x", "arguments": "{}"}
