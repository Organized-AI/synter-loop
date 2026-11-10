from __future__ import annotations

import json
from typing import Any, Callable

from .policy import classify_effect
from .synter_client import SynterError, SynterMcpClient, run_async

_READ_HINTS = {
    "status": ("status", "health", "account", "overview"),
    "performance": ("performance", "analytics", "metric", "report"),
    "spend": ("spend", "cost", "delivery"),
    "attribution": ("attribution", "conversion", "ga4", "capi", "crm"),
    "action": ("search_actions", "search action", "action_search"),
    "tracking": ("tracking", "pixel", "capi", "gtm", "tag"),
}


def _tool_score(tool: dict[str, Any], category: str) -> int:
    name = str(tool.get("name", "")).lower()
    description = str(tool.get("description", "")).lower()
    if classify_effect(name, tool.get("annotations") or tool.get("metadata") or {}) != "read":
        return -1
    hints = _READ_HINTS[category]
    return sum(3 if hint in name else 1 if hint in description else 0 for hint in hints)


def _content(result: dict[str, Any]) -> Any:
    structured = result.get("structuredContent")
    if structured is not None:
        return structured
    blocks = result.get("content")
    if isinstance(blocks, list):
        texts = [item.get("text", "") for item in blocks if isinstance(item, dict) and item.get("type") == "text"]
        if len(texts) == 1:
            try:
                return json.loads(texts[0])
            except (ValueError, TypeError):
                return texts[0]
        if texts:
            return texts
    return result


async def read_category(client: SynterMcpClient, category: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
    tools = await client.list_tools()
    ranked = sorted((( _tool_score(tool, category), tool) for tool in tools), key=lambda pair: pair[0], reverse=True)
    if not ranked or ranked[0][0] <= 0:
        raise SynterError(f"No read-only Synter tool matched category '{category}'")
    score, chosen = ranked[0]
    if score < 0:
        raise SynterError("Synter tool metadata did not identify a read-only action")
    name = str(chosen.get("name", ""))
    result = await client.call_tool(name, arguments or {})
    return {"tool_name": name, "source": category, "data": _content(result)}


def read_json(client_factory: Callable[[], SynterMcpClient], categories: list[str], args: dict[str, Any] | None = None) -> dict[str, Any]:
    async def _run():
        client = client_factory()
        output = []
        for category in categories:
            try:
                output.append(await read_category(client, category, args))
            except SynterError as exc:
                output.append({"source": category, "available": False, "error": str(exc)})
        return {"ok": any(item.get("available", True) for item in output), "evidence": output}
    try:
        return run_async(_run())
    except SynterError as exc:
        return {"ok": False, "error": str(exc), "evidence": []}
    except Exception as exc:
        return {"ok": False, "error": f"Synter read failed ({type(exc).__name__})", "evidence": []}


def safe_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def propose_run(args: dict[str, Any], ledger) -> dict[str, Any]:
    if args.get("dry_run") is False:
        return {"ok": False, "blocked": True, "reason": "live Synter execution is disabled in this local build"}
    action = str(args.get("action", "")).strip()
    if not action:
        return {"ok": False, "error": "action is required"}
    proposal_id = str(args.get("proposal_id") or __import__("uuid").uuid4())
    fields = {"action": action, "arguments": args.get("arguments", {}), "dry_run": True,
              "status": "proposal_only", "external_mutation": False}
    row = ledger.record("proposal", fields, item_id=proposal_id)
    return {"ok": True, "proposal_id": proposal_id, "status": row["fields"]["status"],
            "preview": "Not sent to Synter; no spend or campaign state changed."}


def plan_reallocation(args: dict[str, Any]) -> dict[str, Any]:
    current = args.get("current_spend") or {}
    target = args.get("target_spend") or {}
    if not isinstance(current, dict) or not isinstance(target, dict):
        return {"ok": False, "error": "current_spend and target_spend must be objects"}
    moves = []
    for platform in sorted(set(current) | set(target)):
        try:
            before, after = float(current.get(platform, 0)), float(target.get(platform, 0))
        except (ValueError, TypeError):
            return {"ok": False, "error": f"invalid spend value for {platform}"}
        if before < 0 or after < 0:
            return {"ok": False, "error": "spend values must be non-negative"}
        if before != after:
            moves.append({"platform": platform, "before_usd": before, "after_usd": after, "delta_usd": round(after - before, 2)})
    return {"ok": True, "moves": moves, "total_before_usd": round(sum(map(float, current.values())), 2),
            "total_after_usd": round(sum(map(float, target.values())), 2), "applied": False,
            "note": "Planning only; no impact forecast or live change was made."}
