"""Structured JSON logging configuration.

Replaces loguru's default human-readable sink with a single JSON sink so
that logs from this service can be shipped to any log aggregator (e.g.
CloudWatch, Datadog) and queried by ``trace_id`` or ``task_id``.
"""
from __future__ import annotations

import json
import sys
from typing import Any

from loguru import logger

from .config import get_settings


def _json_sink(message: Any) -> None:
    """Serialize a loguru record to a single-line JSON object on stdout."""
    record = message.record
    payload: dict[str, Any] = {
        "time": record["time"].isoformat(),
        "level": record["level"].name,
        "logger": record["name"],
        "message": record["message"],
    }
    # Promote structured context (extra={...}) to top-level keys so trace_id
    # and task_id become first-class searchable fields.
    for key, value in (record.get("extra") or {}).items():
        if key not in payload:
            payload[key] = value
    if record["exception"]:
        payload["exception"] = str(record["exception"])
    sys.stdout.write(json.dumps(payload, default=str) + "\n")
    sys.stdout.flush()


def configure_logging() -> None:
    """Install the JSON sink as the sole loguru handler."""
    settings = get_settings()
    logger.remove()
    logger.add(
        _json_sink,
        level=settings.log_level.upper(),
        enqueue=False,
        backtrace=False,
        diagnose=False,
    )
    logger.info("JSON logging configured", level=settings.log_level)
