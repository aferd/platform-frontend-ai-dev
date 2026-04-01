"""Cost tracking — writes cycle cost data to costs.jsonl and the dashboard API."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from .agent import CycleContext

logger = logging.getLogger(__name__)

COSTS_API = "http://localhost:8080/api/costs"


def _build_entry(label: str, result, ctx: CycleContext | None = None) -> dict:
    """Build a cost entry dict from an SDK ResultMessage."""
    usage = getattr(result, "usage", None) or {}
    result_text = getattr(result, "result", "") or ""

    model = ""
    model_usage = getattr(result, "model_usage", None)
    if model_usage and isinstance(model_usage, dict):
        model = next(iter(model_usage.keys()), "")

    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "label": label,
        "session_id": getattr(result, "session_id", ""),
        "num_turns": getattr(result, "num_turns", 0),
        "duration_ms": getattr(result, "duration_ms", 0),
        "cost_usd": getattr(result, "total_cost_usd", 0) or 0,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "cache_read_tokens": usage.get("cache_read_input_tokens", 0),
        "cache_write_tokens": usage.get("cache_creation_input_tokens", 0),
        "model": model,
        "is_error": getattr(result, "subtype", "") != "success",
        "no_work": "NO_WORK_FOUND" in result_text,
    }

    if ctx:
        entry["jira_key"] = ctx.jira_key
        entry["repo"] = ctx.repo
        entry["work_type"] = ctx.work_type
        entry["summary"] = ctx.summary

    return entry


def record_cost(costs_file: Path, label: str, result, ctx: CycleContext | None = None) -> bool:
    """Record cost data from a ResultMessage.

    Writes to costs.jsonl (local) and pushes to the dashboard API.
    Returns True if the cycle found no work (for sleep interval decision).
    """
    entry = _build_entry(label, result, ctx)

    # Write to local jsonl (backward compat with costs.sh)
    with open(costs_file, "a") as f:
        f.write(json.dumps(entry) + "\n")

    # Push to dashboard API
    try:
        httpx.post(COSTS_API, json=entry, timeout=3.0)
    except Exception:
        logger.debug("Failed to push cost to dashboard API (dashboard may be down)")

    return entry["no_work"]
