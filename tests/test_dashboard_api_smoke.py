from __future__ import annotations

import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from dashboard import plugin_api


class DashboardApiSmokeTests(unittest.TestCase):
    def test_endpoints_return_aggregate_only_data_and_do_not_claim_changes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            events = [
                {"event_id": "e1", "event_type": "agent_turn_complete", "timestamp": "2026-01-01T00:00:00Z",
                 "run_id": "r1", "session_id": "s1", "turn_id": "t1",
                 "harness_variant": {"prompt_hash": "h1", "model": "fixture", "plugin_version": "0.1.0"},
                 "payload": {"cost_usd": 0.25, "assistant_response": "private text"}},
                {"event_id": "e2", "event_type": "agent_approval", "timestamp": "2026-01-01T00:01:00Z",
                 "run_id": "r1", "session_id": "s1", "turn_id": "t1",
                 "harness_variant": {"prompt_hash": "h1", "model": "fixture", "plugin_version": "0.1.0"},
                 "payload": {"approved": True, "proposal_id": "p1", "arguments": {"budget": 99}}},
            ]
            ledger = [{"item_id": "p1", "kind": "proposal", "created_at": "2026-01-01T00:00:00Z",
                       "fields": {"status": "proposal_only", "arguments": {"budget": 99}, "external_mutation": False}}]
            (root / "events.jsonl").write_text("\n".join(json.dumps(row) for row in events) + "\n", encoding="utf-8")
            (root / "ledger.jsonl").write_text("\n".join(json.dumps(row) for row in ledger) + "\n", encoding="utf-8")
            previous = plugin_api._data_dir
            plugin_api._data_dir = lambda: root
            try:
                overview = asyncio.run(plugin_api.overview())
                ledger_response = asyncio.run(plugin_api.ledger(limit=10))
                harness = asyncio.run(plugin_api.harness_report())
                pnl = asyncio.run(plugin_api.pnl_report())
            finally:
                plugin_api._data_dir = previous

        self.assertEqual(overview["event_count"], 2)
        self.assertEqual(overview["run_count"], 1)
        self.assertNotIn("arguments", json.dumps(ledger_response))
        self.assertNotIn("private text", json.dumps(harness))
        variant = harness["variants"][0]
        self.assertEqual(variant["approval_signals"], 1)
        self.assertIsNone(variant["cost_per_approved_change_usd"])
        self.assertFalse(harness["promotes_variant"])
        self.assertFalse(pnl["causal_claim"])
        self.assertIn("do not prove a change was executed", pnl["note"])


if __name__ == "__main__":
    unittest.main()
