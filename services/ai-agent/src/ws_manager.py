"""WebSocket connection manager.

Maintains a mapping of ``{task_id: [WebSocket]}``.
The supervisor calls ``broadcast_to_task`` to push progress frames.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket
from loguru import logger


class ConnectionManager:
    """Manage active WebSocket connections keyed by task_id."""

    def __init__(self) -> None:
        # task_id → list of connected WebSockets
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, task_id: str, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket for *task_id*."""
        await websocket.accept()
        self._connections[task_id].append(websocket)
        logger.info("WS connected: task_id={} total={}", task_id, len(self._connections[task_id]))

    def disconnect(self, task_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket from the registry."""
        connections = self._connections.get(task_id, [])
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self._connections.pop(task_id, None)
        logger.info("WS disconnected: task_id={}", task_id)

    async def broadcast_to_task(self, task_id: str, frame: dict[str, Any]) -> None:
        """Send *frame* (as JSON) to all WebSocket clients watching *task_id*."""
        connections = list(self._connections.get(task_id, []))
        dead: list[WebSocket] = []

        for ws in connections:
            try:
                await ws.send_json(frame)
            except Exception as exc:  # noqa: BLE001
                logger.warning("WS send failed for task_id={}: {}", task_id, exc)
                dead.append(ws)

        for ws in dead:
            self.disconnect(task_id, ws)

    def active_count(self, task_id: str) -> int:
        """Return the number of active connections for *task_id*."""
        return len(self._connections.get(task_id, []))


# Module-level singleton used by the supervisor and route handlers
manager = ConnectionManager()
