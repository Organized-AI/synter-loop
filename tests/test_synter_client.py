from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from synter_loop.synter_client import SynterError, SynterMcpClient
from synter_loop.tools import read_category


def test_streamable_http_lifecycle_and_read_tool_selection():
    seen = []
    async def handler(request):
        body = json.loads(request.content)
        seen.append((body.get("method"), request.headers.get("x-synter-key"), request.headers.get("mcp-session-id")))
        method = body.get("method")
        if method == "initialize":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": body["id"], "result": {"protocolVersion": "2025-03-26"}}, headers={"Mcp-Session-Id": "fixture-session"})
        if method == "notifications/initialized":
            return httpx.Response(202, content=b"")
        if method == "tools/list":
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": body["id"], "result": {"tools": [
                {"name": "set_campaign_budget", "description": "writes spend", "annotations": {"effect": "write"}},
                {"name": "get_account_status", "description": "read-only status", "annotations": {"effect": "read"}},
            ]}})
        if method == "tools/call":
            assert body["params"]["name"] == "get_account_status"
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": body["id"], "result": {"structuredContent": {"status": "ok"}}})
        return httpx.Response(404)

    client = SynterMcpClient("https://mcp.syntermedia.ai/mcp/", "fixture-key", transport=httpx.MockTransport(handler))
    result = asyncio.run(read_category(client, "status"))
    assert result == {"tool_name": "get_account_status", "source": "status", "data": {"status": "ok"}}
    assert [item[0] for item in seen] == ["initialize", "notifications/initialized", "tools/list", "tools/call"]
    assert all(item[1] == "fixture-key" for item in seen)
    assert seen[-1][2] == "fixture-session"


def test_sse_response_parsing():
    async def handler(request):
        return httpx.Response(200, content=b'data: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\n\n', headers={"content-type": "text/event-stream"})
    client = SynterMcpClient("https://mcp.syntermedia.ai/mcp/", "fixture", transport=httpx.MockTransport(handler))
    result = asyncio.run(client._post({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}))
    assert result["result"]["tools"] == []


def test_endpoint_and_secret_validation():
    with pytest.raises(SynterError, match="HTTPS"):
        SynterMcpClient("http://mcp.syntermedia.ai/", "fixture")
    with pytest.raises(SynterError, match="not configured"):
        SynterMcpClient("https://mcp.syntermedia.ai/", "")
