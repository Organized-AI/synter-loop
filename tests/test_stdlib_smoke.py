from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("synter_loop", ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
module = importlib.util.module_from_spec(spec)
sys.modules["synter_loop"] = module
spec.loader.exec_module(module)

from synter_loop.capture import TurnOutbox, metadata_projection
from synter_loop.events import validate_event
from synter_loop.policy import evaluate_write
from synter_loop.reports import summarize
from synter_loop.storage import EventRecorder, LocalLedger
from synter_loop import plugin


class FakeState:
    def __init__(self):
        self.values = {}

    def get(self, key, default=None):
        return self.values.get(key, default)

    def set(self, key, value):
        self.values[key] = value


class FakeContext:
    def __init__(self):
        self.tools, self.hooks, self.commands, self.cli, self.skills = {}, {}, {}, {}, {}
        self.state = FakeState()

    def get_config(self, key, default=None):
        return default

    def register_tool(self, *, name, toolset, schema, handler, description):
        self.tools[name] = handler

    def register_hook(self, name, handler, **kwargs):
        self.hooks[name] = (handler, kwargs)

    def register_command(self, name, handler, **kwargs):
        self.commands[name] = handler

    def register_cli_command(self, **kwargs):
        self.cli[kwargs["name"]] = kwargs

    def register_skill(self, name, path):
        self.skills[name] = Path(path)


class StdlibSmokeTests(unittest.TestCase):
    def test_event_recorder_validates_and_persists_schema_event(self):
        with tempfile.TemporaryDirectory() as folder:
            recorder = EventRecorder(Path(folder), capture_mode="metadata", model="local-test")
            event = recorder.emit("agent_session_start", {"capture_mode": "metadata"}, session_id="session-1")
            validate_event(event)
            rows = [json.loads(line) for line in (Path(folder) / "events.jsonl").read_text().splitlines()]
            self.assertEqual(rows, [event])
            self.assertEqual(event["harness_variant"]["model"], "local-test")

    def test_event_schema_rejects_unknown_types_and_missing_fields(self):
        with tempfile.TemporaryDirectory() as folder:
            event = EventRecorder(Path(folder)).emit("agent_session_start", {"capture_mode": "off"})
            invalid = dict(event, event_type="made_up")
            with self.assertRaises(ValueError):
                validate_event(invalid)
            invalid = dict(event, payload={})
            with self.assertRaises(ValueError):
                validate_event(invalid)

    def test_ledger_is_idempotent_and_report_is_descriptive(self):
        with tempfile.TemporaryDirectory() as folder:
            ledger = LocalLedger(Path(folder))
            first = ledger.record("proposal", {"status": "proposal_only"}, item_id="p1")
            second = ledger.record("proposal", {"status": "proposal_only"}, item_id="p1")
            self.assertEqual(first, second)
            self.assertEqual(len(ledger.list()), 1)
            report = summarize([{"event_id": "e1", "event_type": "agent_turn_complete", "session_id": "s1",
                                 "harness_variant": {"prompt_hash": "h", "model": "m", "plugin_version": "0.1"},
                                 "payload": {"cost_usd": 0.25}}])
            self.assertFalse(report["promotes_variant"])
            self.assertEqual(report["variants"][0]["turns"], 1)

    def test_external_writes_fail_closed_or_remain_proposals(self):
        unknown = evaluate_write(tool_name="mcp__other__mystery", effect="unknown")
        self.assertEqual(unknown.decision, "block")
        proposal = evaluate_write(tool_name="mcp__synter__set_budget", effect="write", mode="propose_only")
        self.assertEqual(proposal.decision, "proposal")
        frozen = evaluate_write(tool_name="mcp__synter__set_budget", effect="write", frozen=True, mode="approval")
        self.assertEqual(frozen.decision, "block")

    def test_metadata_capture_redacts_private_fields_and_offbox_flush_stays_disabled(self):
        projection = metadata_projection([{"event_type": "agent_turn_start", "payload": {"message_hash": "h", "prompt": "private", "arguments": {"budget": 900}}}])
        serialized = json.dumps(projection)
        self.assertNotIn("private", serialized)
        self.assertNotIn('"budget"', serialized)
        with tempfile.TemporaryDirectory() as folder:
            outbox = TurnOutbox(Path(folder))
            self.assertFalse(outbox.enqueue("turn-1", [{"ok": True}], mode="off"))
            self.assertEqual(outbox.flush("", "", mode="off"), {"sent": 0, "pending": 0, "disabled": True})

    def test_native_plugin_registers_propose_only_tools_and_write_gate(self):
        with tempfile.TemporaryDirectory() as folder:
            previous = os.environ.get("HERMES_HOME")
            os.environ["HERMES_HOME"] = folder
            try:
                ctx = FakeContext()
                plugin.register_plugin(ctx)
                self.assertIn("synter_run", ctx.tools)
                self.assertIn("synter_status", ctx.tools)
                self.assertIn("pre_tool_call", ctx.hooks)
                result = json.loads(ctx.tools["synter_run"]({"action": "set_budget", "arguments": {"delta": 5}}))
                self.assertEqual(result["status"], "proposal_only")
                decision = ctx.hooks["pre_tool_call"][0](tool_name="mcp__synter__set_campaign_budget", args={"budget": 500}, task_id="t1")
                self.assertEqual(decision["action"], "block")
            finally:
                if previous is None:
                    os.environ.pop("HERMES_HOME", None)
                else:
                    os.environ["HERMES_HOME"] = previous


if __name__ == "__main__":
    unittest.main()
