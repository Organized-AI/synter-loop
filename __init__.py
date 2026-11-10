from __future__ import annotations

from typing import Any


def register(ctx) -> None:
    """Public registration entry point for the Hermes v0.23.0 native plugin API."""
    from .plugin import register_plugin
    register_plugin(ctx)
