from __future__ import annotations

import asyncio
import json
from itertools import count
from typing import Any
from urllib.parse import urlsplit

import httpx


class SynterError(RuntimeError):
    pass


class SynterMcpClient:
    """Small Streamable HTTP MCP client; only sends calls explicitly requested by the caller."""

    def __init__(self, endpoint: str, api_key: str, *, timeout: float = 12.0,
                 transport: httpx.AsyncBaseTransport | None = None):
        parts = urlsplit(endpoint)
        if parts.scheme != "https" and not (parts.scheme == "http" and parts.hostname in {"127.0.0.1", "localhost"}):
            raise SynterError("Synter endpoint must use HTTPS (HTTP is allowed only for localhost tests)")
        if parts.username or parts.password or not parts.hostname:
            raise SynterError("Invalid Synter endpoint")
        if not api_key:
            raise SynterError("SYNTER_API_KEY is not configured in this Hermes profile")
        self.endpoint = endpoint
        self.api_key = api_key
        self.timeout = timeout
        self.transport = transport
        self._ids = count(1)
        self._session_id: str | None = None
        self._initialized = False

    async def _post(self, message: dict[str, Any]) -> dict[str, Any]:
        headers = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json",
                   "X-Synter-Key": self.api_key, "MCP-Protocol-Version": "2025-03-26"}
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        try:
            async with httpx.AsyncClient(timeout=self.timeout, transport=self.transport, follow_redirects=False) as client:
                response = await client.post(self.endpoint, headers=headers, json=message)
        except httpx.TimeoutException as exc:
            raise SynterError("Synter MCP request timed out") from exc
        except httpx.HTTPError as exc:
            raise SynterError(f"Synter MCP transport failed ({type(exc).__name__})") from exc
        if response.status_code >= 300:
            raise SynterError(f"Synter MCP returned HTTP {response.status_code}")
        if len(response.content) > 2_000_000:
            raise SynterError("Synter MCP response exceeded 2 MB")
        self._session_id = response.headers.get("Mcp-Session-Id", self._session_id)
        content_type = response.headers.get("content-type", "").lower()
        if not response.content:
            return {}  # successful MCP notifications may receive an empty 202 response
        try:
            if "text/event-stream" in content_type:
                candidates = [line[5:].strip() for line in response.text.splitlines() if line.startswith("data:")]
                values = [json.loads(line) for line in candidates if line and line != "[DONE]"]
                if not values:
                    raise SynterError("Synter MCP returned an empty event stream")
                return values[-1]
            return response.json()
        except (ValueError, json.JSONDecodeError) as exc:
            raise SynterError("Synter MCP response was not valid JSON/SSE") from exc

    async def _request(self, method: str, params: dict[str, Any] | None = None, *, notification: bool = False) -> dict[str, Any]:
        message: dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if not notification:
            message["id"] = next(self._ids)
        if params is not None:
            message["params"] = params
        result = await self._post(message)
        if "error" in result:
            error = result.get("error") or {}
            raise SynterError(f"Synter MCP error {error.get('code', 'unknown')}")
        return result

    async def initialize(self) -> None:
        if self._initialized:
            return
        await self._request("initialize", {"protocolVersion": "2025-03-26", "capabilities": {},
                                             "clientInfo": {"name": "synter-loop", "version": "0.1.0"}})
        await self._request("notifications/initialized", notification=True)
        self._initialized = True

    async def list_tools(self) -> list[dict[str, Any]]:
        await self.initialize()
        response = await self._request("tools/list")
        result = response.get("result", {})
        tools = result.get("tools", []) if isinstance(result, dict) else []
        return [item for item in tools if isinstance(item, dict)]

    async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        await self.initialize()
        response = await self._request("tools/call", {"name": name, "arguments": arguments or {}})
        result = response.get("result", {})
        if not isinstance(result, dict):
            raise SynterError("Synter MCP returned an invalid tool result")
        if result.get("isError"):
            raise SynterError("Synter read tool reported an error")
        return result


def run_async(coro):
    """Run async MCP operations from Hermes' synchronous plugin-tool worker."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    raise SynterError("Cannot run Synter MCP client from an active event loop")
