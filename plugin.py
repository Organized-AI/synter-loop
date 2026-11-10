from __future__ import annotations

import hashlib
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import capture, reports, tools, truth, witness
from .holdout import assign_holdout
from .policy import classify_effect, evaluate_write
from .storage import EventRecorder, LocalLedger, append_jsonl, read_jsonl

PLUGIN_VERSION = "0.1.0"
BUILD_LIVE_WRITES_ENABLED = False

TOOL_NAMES = [
    "synter_status", "synter_performance", "synter_reconcile", "synter_find_action",
    "synter_tracking_health", "synter_run", "synter_plan_reallocation", "synter_ledger",
    "synter_harness_report", "synter_witness_report", "synter_watch",
]
HOOK_NAMES = [
    "on_session_start", "pre_llm_call", "pre_api_request", "post_api_request", "post_llm_call",
    "pre_tool_call", "post_tool_call", "subagent_start", "subagent_stop",
    "post_approval_response", "on_session_end", "transform_llm_output",
]


def _secret(name: str) -> str | None:
    try:
        from agent.secret_scope import get_secret
        return get_secret(name)
    except Exception:
        # Missing/unscoped secret fails closed without leaking exception details.
        return None


def _schema(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": required or [], "additionalProperties": True}


_EMPTY = {"type": "object", "properties": {}, "additionalProperties": True}
_SCHEMAS = {
    "synter_status": _schema({}),
    "synter_performance": _schema({"window": {"type": "string"}, "platform": {"type": "string"}}),
    "synter_reconcile": _schema({"window": {"type": "string"}, "account": {"type": "string"}}),
    "synter_find_action": _schema({"query": {"type": "string"}}, ["query"]),
    "synter_tracking_health": _schema({"url": {"type": "string"}, "account": {"type": "string"}}),
    "synter_run": _schema({"action": {"type": "string"}, "arguments": {"type": "object"}, "dry_run": {"type": "boolean"}, "proposal_id": {"type": "string"}}, ["action"]),
    "synter_plan_reallocation": _schema({"current_spend": {"type": "object"}, "target_spend": {"type": "object"}}, ["current_spend", "target_spend"]),
    "synter_ledger": _schema({"limit": {"type": "integer", "minimum": 1, "maximum": 1000}}),
    "synter_harness_report": _schema({"limit": {"type": "integer", "minimum": 1, "maximum": 10000}}),
    "synter_witness_report": _schema({"trace": {"type": "array", "items": {"type": "object"}}, "expected": {"type": "array", "items": {"type": "string"}}}, ["trace"]),
    "synter_watch": _schema({}),
}


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def _read_event_data(data_dir: Path, limit: int = 10000) -> list[dict[str, Any]]:
    return read_jsonl(data_dir / "events.jsonl")[-max(1, min(int(limit), 10000)):]


def _truthy_health(value: Any) -> bool:
    if isinstance(value, dict):
        if value.get("healthy") is True or value.get("ok") is True:
            return True
        if str(value.get("status", "")).lower() in {"healthy", "ok", "pass"}:
            return True
        for item in value.get("evidence", []) if isinstance(value.get("evidence"), list) else []:
            if _truthy_health(item.get("data") if isinstance(item, dict) else item):
                return True
    return False


def _register_cli(ctx, config: dict[str, Any], ledger: LocalLedger, data_dir: Path) -> None:
    def setup(parser):
        subs = parser.add_subparsers(dest="action")
        for name in ("setup", "doctor", "ledger", "watch"):
            child = subs.add_parser(name)
            if name in {"ledger", "watch"}:
                child.add_argument("--json", action="store_true")
                if name == "ledger":
                    child.add_argument("--limit", type=int, default=100)
        replay = subs.add_parser("replay")
        replay.add_argument("run_id")
        replay.add_argument("--json", action="store_true")

    def command(args):
        action = getattr(args, "action", None) or "doctor"
        if action == "setup":
            print(_json({"plugin": "synter-loop", "setup": "configure SYNTER_API_KEY through Hermes auth/settings; no secret was read or printed", "network": "not contacted"}))
        elif action == "doctor":
            print(_json({"plugin": "synter-loop", "data_dir": str(data_dir), "synter_key_configured": bool(_secret("SYNTER_API_KEY")), "capture_mode": config["capture"], "live_writes": "disabled"}))
        elif action == "ledger":
            print(_json({"items": ledger.list(getattr(args, "limit", 100))}))
        elif action == "watch":
            print(_json({"items": _watch_items(ledger)}))
        elif action == "replay":
            rows = [row for row in _read_event_data(data_dir) if row.get("run_id") == args.run_id or row.get("turn_id") == args.run_id]
            print(_json({"run_id": args.run_id, "events": rows}))
        else:
            print(_json({"error": "unknown synter command"}))
    ctx.register_cli_command(name="synter", help="Inspect local Synter Loop state", setup_fn=setup, handler_fn=command)


def _watch_items(ledger: LocalLedger) -> list[dict[str, Any]]:
    items = []
    for row in ledger.list(1000):
        if row.get("kind") == "proposal":
            f = row.get("fields", {})
            items.append({"id": row.get("item_id"), "title": "Spend change proposal", "url": f"synter://proposal/{row.get('item_id')}",
                          "status": "open", "detail": f.get("action", "proposal is awaiting a human" )})
    return items


def register_plugin(ctx) -> None:
    """Register tools, hooks, slash command, CLI, and portable skill via public API."""
    from plugins.plugin_storage import plugin_data_dir

    config = {
        "max_daily_increase_usd": float(ctx.get_config("max_daily_increase_usd", default=250.0)),
        "max_change_usd": float(ctx.get_config("max_change_usd", default=100.0)),
        "per_platform_caps": ctx.get_config("per_platform_caps", default={}) or {},
        "tracking_gate": bool(ctx.get_config("tracking_gate", default=True)),
        "dry_run_first": bool(ctx.get_config("dry_run_first", default=True)),
        "synter_mcp_url": ctx.get_config("synter_mcp_url", default="https://mcp.syntermedia.ai/mcp/"),
        "decision_model": ctx.get_config("decision_model", default="none"),
        "jev_gateway_url": ctx.get_config("jev_gateway_url", default=""),
        "jev_bands": ctx.get_config("jev_bands", default={"pass": 0.8, "warn": 0.5}) or {"pass": 0.8, "warn": 0.5},
        "mode": ctx.get_config("mode", default="propose_only"),
        "truth_mode": ctx.get_config("truth_mode", default="footnote"),
        "grade_after_days": int(ctx.get_config("grade_after_days", default=7)),
        "capture": ctx.get_config("capture", default="off"),
        "capture_endpoint": ctx.get_config("capture_endpoint", default=""),
        "capture_result_cap_chars": int(ctx.get_config("capture_result_cap_chars", default=4000)),
        "witness_backend": ctx.get_config("witness_backend", default="local"),
        "holdout_share": float(ctx.get_config("holdout_share", default=0.0)),
        "holdout_variant": ctx.get_config("holdout_variant", default=""),
    }
    data_dir = Path(plugin_data_dir("synter-loop"))
    ledger = LocalLedger(data_dir)
    recorder = EventRecorder(data_dir, capture_mode=config["capture"], holdout_share=config["holdout_share"],
                             holdout_variant=config["holdout_variant"], jev_map_version="unverified" if config["decision_model"] == "jev" else None)
    outbox = capture.TurnOutbox(data_dir)

    def client_factory():
        from .synter_client import SynterMcpClient
        key = _secret("SYNTER_API_KEY")
        return SynterMcpClient(config["synter_mcp_url"], key or "")

    def make_read(category: str):
        categories = {"status": ["status"], "performance": ["performance"],
                      "reconcile": ["spend", "attribution"], "action": ["action"], "tracking": ["tracking"]}[category]
        def handler(args: dict, **kwargs) -> str:
            response = tools.read_json(client_factory, categories, args)
            if category == "tracking" and response.get("ok"):
                healthy = _truthy_health(response)
                ctx.state.set("tracking_health", {"healthy": healthy, "checked_at": time.time(), "evidence": response})
            if category == "performance" and response.get("ok"):
                session_id = kwargs.get("session_id", "")
                ctx.state.set(f"performance:{session_id}", {"run_id": kwargs.get("turn_id") or kwargs.get("task_id") or session_id,
                                                              "sources": response.get("evidence", [])})
            return _json(response)
        return handler

    def synter_run(args: dict, **kwargs) -> str:
        response = tools.propose_run(args, ledger)
        if response.get("ok"):
            recorder.emit("agent_gate_decision", {"tool_name": "synter_run", "decision": "proposal", "reasons": ["local-only dry run"],
                                                   "proposal_id": response.get("proposal_id")}, session_id=kwargs.get("session_id"),
                          turn_id=kwargs.get("turn_id") or kwargs.get("task_id"))
        return _json(response)

    def plan_reallocation(args: dict, **kwargs) -> str:
        result = tools.plan_reallocation(args)
        if result.get("ok"):
            row = ledger.record("reallocation_plan", result, item_id=str(uuid.uuid4()))
            result["proposal_id"] = row["item_id"]
        return _json(result)

    def ledger_tool(args: dict, **kwargs) -> str:
        return _json({"items": ledger.list(args.get("limit", 100))})

    def harness_tool(args: dict, **kwargs) -> str:
        return _json(reports.summarize(_read_event_data(data_dir, args.get("limit", 10000))))

    def witness_tool(args: dict, **kwargs) -> str:
        trace = args.get("trace", [])
        return _json(witness.analyze_trace(trace, args.get("expected")))

    def watch_tool(args: dict, **kwargs) -> str:
        return _json({"items": _watch_items(ledger)})

    handlers = {
        "synter_status": make_read("status"),
        "synter_performance": make_read("performance"),
        "synter_reconcile": make_read("reconcile"),
        "synter_find_action": make_read("action"),
        "synter_tracking_health": make_read("tracking"),
        "synter_run": synter_run,
        "synter_plan_reallocation": plan_reallocation,
        "synter_ledger": ledger_tool,
        "synter_harness_report": harness_tool,
        "synter_witness_report": witness_tool,
        "synter_watch": watch_tool,
    }
    descriptions = {
        "synter_status": "Read-only Synter connection/account status.",
        "synter_performance": "Read-only campaign performance observations; figures retain source attribution.",
        "synter_reconcile": "Compare read-only spend and attribution sources side by side.",
        "synter_find_action": "Search available Synter actions without executing them.",
        "synter_tracking_health": "Read-only pixel, CAPI, and GTM tracking health check.",
        "synter_run": "Create a local dry-run proposal only; live Synter execution is disabled.",
        "synter_plan_reallocation": "Calculate a spend reallocation proposal; never applies it.",
        "synter_ledger": "Read the local proposal and outcome ledger.",
        "synter_harness_report": "Summarize local event fixtures into Agent P&L metrics; never promotes a variant.",
        "synter_witness_report": "Summarize a supplied browser trace; URLs and query strings are not returned.",
        "synter_watch": "Return open local proposals in the stable watch JSON shape.",
    }
    for name in TOOL_NAMES:
        ctx.register_tool(name=name, toolset="synter", schema=_SCHEMAS[name], handler=handlers[name], description=descriptions[name])

    def on_session_start(session_id: str = "", model: str = "", platform: str = "", **kwargs):
        recorder.model = model or ""
        recorder.emit("agent_session_start", {"capture_mode": config["capture"]}, session_id=session_id)

    def pre_llm_call(session_id: str = "", user_message: str = "", model: str = "", **kwargs):
        turn_id = kwargs.get("turn_id") or kwargs.get("task_id") or str(uuid.uuid4())
        ctx.state.set(f"active_turn:{session_id}", turn_id)
        ctx.state.set(f"turn_usage:{turn_id}", {"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0,
                                                    "reasoning_tokens": 0, "cost_usd": 0.0, "latency_ms": 0})
        ctx.state.set(f"performance_question:{session_id}", truth.is_performance_question(user_message))
        payload = {"message_hash": hashlib.sha256(user_message.encode("utf-8")).hexdigest()}
        if config["capture"] == "full":
            payload["user_message"] = user_message[:config["capture_result_cap_chars"]]
        recorder.model = model or recorder.model
        recorder.emit("agent_turn_start", payload, session_id=session_id, turn_id=turn_id)
        if truth.is_performance_question(user_message):
            evidence = ctx.state.get(f"performance:{session_id}", default=None)
            if evidence:
                return {"context": "Prior same-session performance evidence (verify freshness and run ID before use): " + _json(evidence)}
        return None

    def pre_api_request(session_id: str = "", api_request_id: str = "", turn_id: str = "", **kwargs):
        ctx.state.set(f"api_start:{api_request_id or turn_id}", time.monotonic())

    def post_api_request(session_id: str = "", turn_id: str = "", model: str = "", usage: dict | None = None,
                         api_duration: float = 0.0, response_model: str | None = None, **kwargs):
        usage = usage or {}
        inp = int(usage.get("input_tokens", usage.get("prompt_tokens", 0)) or 0)
        out = int(usage.get("output_tokens", usage.get("completion_tokens", 0)) or 0)
        cached = int(usage.get("cached_tokens", (usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0)) or 0)
        reasoning = int(usage.get("reasoning_tokens", (usage.get("completion_tokens_details") or {}).get("reasoning_tokens", 0)) or 0)
        cost = float(usage.get("cost_usd", 0.0) or 0.0)
        turn_id = turn_id or ctx.state.get(f"active_turn:{session_id}", default="")
        current = ctx.state.get(f"turn_usage:{turn_id}", default={"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0,
                                                                          "reasoning_tokens": 0, "cost_usd": 0.0, "latency_ms": 0})
        current.update({"input_tokens": current.get("input_tokens", 0) + inp,
                        "output_tokens": current.get("output_tokens", 0) + out,
                        "cached_tokens": current.get("cached_tokens", 0) + cached,
                        "reasoning_tokens": current.get("reasoning_tokens", 0) + reasoning,
                        "cost_usd": current.get("cost_usd", 0.0) + cost,
                        "latency_ms": current.get("latency_ms", 0) + int(max(0, api_duration * 1000))})
        ctx.state.set(f"turn_usage:{turn_id}", current)
        recorder.emit("agent_model_call", {"model": response_model or model or "", "status": "ok", "latency_ms": int(max(0, api_duration * 1000)),
                                             "input_tokens": inp, "output_tokens": out, "cached_tokens": cached,
                                             "reasoning_tokens": reasoning, "cost_usd": cost}, session_id=session_id, turn_id=turn_id)

    def post_llm_call(session_id: str = "", user_message: str = "", assistant_response: str = "", **kwargs):
        turn_id = kwargs.get("turn_id") or ctx.state.get(f"active_turn:{session_id}", default="")
        usage = ctx.state.get(f"turn_usage:{turn_id}", default={})
        payload = {"status": "success", "total_tokens": int(usage.get("input_tokens", 0)) + int(usage.get("output_tokens", 0)),
                   "cost_usd": float(usage.get("cost_usd", 0.0)), "latency_ms": int(usage.get("latency_ms", 0))}
        if config["capture"] == "full":
            payload["assistant_response"] = assistant_response[:config["capture_result_cap_chars"]]
        recorder.emit("agent_turn_complete", payload, session_id=session_id, turn_id=turn_id)
        _queue_and_flush(session_id, turn_id, data_dir, outbox, config)

    def pre_tool_call(tool_name: str = "", args: dict | None = None, task_id: str = "", **kwargs):
        args = args or {}
        # Our own runner is a local proposal helper; it can never execute a write.
        if tool_name == "synter_run":
            if args.get("dry_run", True) is not False:
                return None
            recorder.emit("agent_gate_decision", {"tool_name": tool_name, "decision": "block", "reasons": ["live execution disabled in this build"]},
                          session_id=kwargs.get("session_id"), turn_id=task_id)
            return {"action": "block", "message": "Live Synter execution is disabled in this local build. Use a dry-run proposal."}
        is_synter = "synter" in tool_name.lower() or "campaign" in tool_name.lower() or "ad_spend" in tool_name.lower()
        if not is_synter:
            return None
        metadata = kwargs.get("tool_metadata") or kwargs.get("metadata") or {}
        effect = classify_effect(tool_name, metadata)
        if effect == "read":
            return None
        # This local build has no live mutation implementation. Never rely on model-supplied
        # tracking or budget figures to authorize a third-party MCP tool.
        frozen = bool(ctx.state.get("frozen", default=False))
        unattended = str(kwargs.get("execution_identity", "")).lower() == "cron" or str(kwargs.get("platform", "")).lower() == "cron"
        tracking = ctx.state.get("tracking_health", default={}) or {}
        tracking_fresh = bool(tracking.get("healthy") is True and time.time() - float(tracking.get("checked_at", 0)) <= 300)
        conservative = evaluate_write(
            tool_name=tool_name, effect=effect, delta_usd=float(args.get("delta_usd", 0) or 0),
            daily_after_usd=args.get("daily_after_usd"), platform=str(args.get("platform", "")),
            platform_after_usd=args.get("platform_after_usd"), tracking_ok=tracking_fresh,
            tracking_gate=config["tracking_gate"], frozen=frozen, unattended=unattended,
            mode=config["mode"], max_change_usd=config["max_change_usd"],
            max_daily_increase_usd=config["max_daily_increase_usd"],
            platform_caps=config["per_platform_caps"], synter_ok=False,
            dry_run_first=config["dry_run_first"],
        )
        reasons = list(conservative.reasons) or ["external Synter writes are proposal-only in this local build"]
        if effect == "unknown":
            reasons.insert(0, "tool effect is unknown; fail closed")
        if conservative.decision == "proposal":
            decision = "proposal"
        else:
            decision = "block"
        row = ledger.record("proposal", {"tool_name": tool_name, "arguments": args, "status": decision,
                                         "reasons": reasons}, item_id=str(uuid.uuid4()))
        recorder.emit("agent_gate_decision", {"tool_name": tool_name, "decision": decision, "reasons": reasons,
                                               "proposal_id": row["item_id"]}, session_id=kwargs.get("session_id"), turn_id=task_id)
        return {"action": "block", "message": f"{'; '.join(reasons)}. Local proposal {row['item_id']} recorded; no external change made."}

    def post_tool_call(tool_name: str = "", args: dict | None = None, result: Any = "", duration_ms: int = 0,
                       task_id: str = "", **kwargs):
        args = args or {}
        try:
            decoded = json.loads(result) if isinstance(result, str) else result
            status = "error" if isinstance(decoded, dict) and decoded.get("error") else "ok"
        except (ValueError, TypeError):
            status = "ok"
        payload = {"tool_name": tool_name, "status": status, "latency_ms": max(0, int(duration_ms)),
                   "effect": classify_effect(tool_name, kwargs.get("tool_metadata") or kwargs.get("metadata") or {})}
        if config["capture"] == "full":
            payload["openai_tool_call"] = {"id": str(kwargs.get("tool_call_id", task_id)), "type": "function",
                                            "function": {"name": tool_name, "arguments": _json(args)}}
            payload["tool_result"] = str(result)[:config["capture_result_cap_chars"]]
        recorder.emit("agent_tool_call", payload, session_id=kwargs.get("session_id"), turn_id=task_id or kwargs.get("turn_id"))

    def subagent_start(task_id: str = "", session_id: str = "", **kwargs):
        recorder.emit("agent_subagent", {"child_id": task_id or str(uuid.uuid4()), "status": "started"},
                      session_id=session_id, turn_id=kwargs.get("turn_id") or task_id)

    def subagent_stop(task_id: str = "", session_id: str = "", **kwargs):
        recorder.emit("agent_subagent", {"child_id": task_id or str(uuid.uuid4()), "status": "stopped"},
                      session_id=session_id, turn_id=kwargs.get("turn_id") or task_id)

    def post_approval_response(tool_name: str = "", approved: bool = False, task_id: str = "", **kwargs):
        recorder.emit("agent_approval", {"tool_name": tool_name, "approved": bool(approved),
                                           "proposal_id": kwargs.get("proposal_id", "")},
                      session_id=kwargs.get("session_id"), turn_id=task_id or kwargs.get("turn_id"))

    def on_session_end(session_id: str = "", completed: bool = True, interrupted: bool = False, **kwargs):
        turn_id = ctx.state.get(f"active_turn:{session_id}", default="")
        existing = [e for e in _read_event_data(data_dir) if e.get("event_type") == "agent_turn_complete" and e.get("turn_id") == turn_id]
        if not existing and turn_id:
            usage = ctx.state.get(f"turn_usage:{turn_id}", default={})
            recorder.emit("agent_turn_complete", {"status": "interrupted" if interrupted else "incomplete" if not completed else "success",
                                                   "total_tokens": int(usage.get("input_tokens", 0)) + int(usage.get("output_tokens", 0)),
                                                   "cost_usd": float(usage.get("cost_usd", 0.0)),
                                                   "latency_ms": int(usage.get("latency_ms", 0))},
                          session_id=session_id, turn_id=turn_id)
            _queue_and_flush(session_id, turn_id, data_dir, outbox, config)

    def transform_llm_output(output: str = "", session_id: str = "", **kwargs):
        if not ctx.state.get(f"performance_question:{session_id}", default=False):
            return None
        evidence = ctx.state.get(f"performance:{session_id}", default=None)
        if not evidence or not isinstance(evidence.get("sources"), list):
            return None
        sources: dict[str, Any] = {}
        for row in evidence["sources"]:
            if isinstance(row, dict) and row.get("available") is not False:
                sources[row.get("source", "unknown")] = row.get("data")
        transformed, mismatches = truth.reconcile_answer(output, {"run_id": evidence.get("run_id"), "sources": sources}, mode=config["truth_mode"])
        if mismatches:
            return transformed
        return None

    def _on_session_finalize(session_id: str | None = None, **kwargs):
        # Observer-only cleanup; data is already persisted locally.
        return None

    hooks = {
        "on_session_start": on_session_start,
        "pre_llm_call": pre_llm_call,
        "pre_api_request": pre_api_request,
        "post_api_request": post_api_request,
        "post_llm_call": post_llm_call,
        "pre_tool_call": pre_tool_call,
        "post_tool_call": post_tool_call,
        "subagent_start": subagent_start,
        "subagent_stop": subagent_stop,
        "post_approval_response": post_approval_response,
        "on_session_end": on_session_end,
        "transform_llm_output": transform_llm_output,
    }
    for name in HOOK_NAMES:
        if name == "transform_llm_output":
            ctx.register_hook(name, hooks[name], hold_stream=True)
        else:
            ctx.register_hook(name, hooks[name])

    ctx.register_command("ads", handler=lambda raw_args, session_id="", **kw: _ads_command(raw_args, session_id, ctx, ledger),
                         description="Inspect local Synter proposals and freeze state", args_hint="[ledger|freeze|unfreeze|apply <proposal-id>]")
    _register_cli(ctx, config, ledger, data_dir)
    skill_file = Path(__file__).parent / "skills" / "synter-ad-ops" / "SKILL.md"
    if skill_file.exists():
        ctx.register_skill("synter-ad-ops", skill_file)


def _ads_command(raw_args: str, session_id: str, ctx, ledger: LocalLedger) -> str:
    parts = raw_args.strip().split()
    action = parts[0] if parts else "help"
    if action in {"help", ""}:
        return "Usage: /ads [ledger|freeze|unfreeze|apply <proposal-id>]"
    if action == "ledger":
        return _json({"items": ledger.list(50)})
    if action == "freeze":
        ctx.state.set("frozen", True)
        return "Synter Loop is frozen for this profile. External writes are blocked."
    if action == "unfreeze":
        ctx.state.set("frozen", False)
        return "Profile freeze cleared; this local build still blocks live writes."
    if action == "apply":
        return "Blocked: applying proposals is disabled in this local build. No external change was made."
    return "Usage: /ads [ledger|freeze|unfreeze|apply <proposal-id>]"


def _queue_and_flush(session_id: str, turn_id: str, data_dir: Path, outbox: capture.TurnOutbox,
                     config: dict[str, Any]) -> None:
    mode = config["capture"]
    if mode == "off":
        return
    events = [e for e in _read_event_data(data_dir) if e.get("session_id") == session_id and e.get("turn_id") == turn_id]
    if not events:
        return
    outbox.enqueue(turn_id, events, mode=mode, cap_chars=config["capture_result_cap_chars"])
    token = _secret("SYNTER_CAPTURE_TOKEN")
    if config.get("capture_endpoint") and token:
        # Failures stay in the local outbox; never throw from an observer hook.
        try:
            outbox.flush(config["capture_endpoint"], token, mode=mode)
        except Exception:
            return
