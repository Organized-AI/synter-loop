from __future__ import annotations

import os
from pathlib import Path

import yaml

from synter_loop import plugin


class State:
    def __init__(self): self.values = {}
    def get(self, key, default=None): return self.values.get(key, default)
    def set(self, key, value): self.values[key] = value


class FakeContext:
    def __init__(self):
        self.tools = {}
        self.hooks = {}
        self.commands = {}
        self.cli = {}
        self.skills = {}
        self.state = State()
    def get_config(self, key, default=None): return default
    def register_tool(self, *, name, toolset, schema, handler, description): self.tools[name] = handler
    def register_hook(self, name, handler, **kwargs): self.hooks[name] = (handler, kwargs)
    def register_command(self, name, handler, **kwargs): self.commands[name] = handler
    def register_cli_command(self, **kwargs): self.cli[kwargs["name"]] = kwargs
    def register_skill(self, name, path): self.skills[name] = Path(path)


def test_manifest_matches_native_registration_and_local_hooks(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    ctx = FakeContext()
    plugin.register_plugin(ctx)
    manifest = yaml.safe_load((Path(__file__).parents[1] / "plugin.yaml").read_text())
    assert set(manifest["provides_tools"]) == set(ctx.tools) == set(plugin.TOOL_NAMES)
    assert set(manifest["provides_hooks"]) == set(ctx.hooks) == set(plugin.HOOK_NAMES)
    assert "ads" in ctx.commands and "synter" in ctx.cli and "synter-ad-ops" in ctx.skills
    assert ctx.hooks["transform_llm_output"][1]["hold_stream"] is True

    blocked = ctx.hooks["pre_tool_call"][0](tool_name="synter_run", args={"dry_run": False}, task_id="t-1")
    assert blocked["action"] == "block"
    assert "disabled" in blocked["message"]
    proposed = ctx.tools["synter_run"]({"action": "set_budget", "arguments": {"delta": 5}}, session_id="s-1", task_id="t-1")
    assert '"status": "proposal_only"' in proposed
    assert ctx.tools["synter_run"]({"action": "set_budget", "dry_run": False})

    # All writes from the user-configured Synter MCP remain blocked by this local build.
    gate = ctx.hooks["pre_tool_call"][0](tool_name="mcp__synter__set_campaign_budget",
                                          args={"budget": 500}, task_id="t-2")
    assert gate["action"] == "block"
    assert "no external change made" in gate["message"]


def test_offline_tools_do_not_need_credentials_or_call_network(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    ctx = FakeContext()
    plugin.register_plugin(ctx)
    result = ctx.tools["synter_status"]({})
    assert '"ok": false' in result.lower()
    assert "not configured" in result.lower()
    ledger = ctx.tools["synter_ledger"]({})
    assert '"items": []' in ledger
