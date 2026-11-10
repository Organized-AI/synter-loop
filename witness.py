from __future__ import annotations

from urllib.parse import urlsplit
from typing import Any

_TAG_HOSTS = {
    "googletagmanager.com": "GTM",
    "google-analytics.com": "GA4",
    "analytics.google.com": "GA4",
    "facebook.com": "Meta Pixel",
    "connect.facebook.net": "Meta Pixel",
    "redditstatic.com": "Reddit Pixel",
    "reddit.com": "Reddit Pixel",
    "tiktok.com": "TikTok Pixel",
    "analytics.tiktok.com": "TikTok Pixel",
}


def _provider(host: str) -> str | None:
    host = host.lower().strip(".")
    for suffix, label in _TAG_HOSTS.items():
        if host == suffix or host.endswith("." + suffix):
            return label
    return None


def analyze_trace(trace: list[dict[str, Any]], expected: list[str] | None = None) -> dict[str, Any]:
    fired: dict[str, list[str]] = {}
    for item in trace:
        raw_url = str(item.get("url", ""))
        try:
            parsed = urlsplit(raw_url)
        except ValueError:
            continue
        label = _provider(parsed.hostname or "")
        if label:
            # Deliberately omit query strings, fragments, and request bodies.
            safe_location = f"{parsed.hostname}{parsed.path[:120]}"
            fired.setdefault(label, []).append(safe_location)
        if item.get("type") == "dataLayer" and item.get("event"):
            fired.setdefault("dataLayer", []).append(str(item["event"])[:80])
    expected = expected or list(_TAG_HOSTS.values())[:]
    expected_unique = sorted(set(expected))
    return {"fired": {k: sorted(set(v)) for k, v in fired.items()},
            "missing": [name for name in expected_unique if name not in fired],
            "trace_count": len(trace), "contains_raw_urls": False}
