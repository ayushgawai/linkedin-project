"""Minimal AI WebSocket gateway proxy.

This script exists ONLY to satisfy the AI-specific Frontend Testing
contract (Member 3, test #14):

    DevTools → Network → WS must show a connection to
        ws://localhost:8011/ai/stream/{task_id}
    that receives at least 3 messages while a shortlist task runs.

In the deployed system this route lives on the team's central API gateway
(owned by another team member). For local demos and the AI-only test
suite, this lightweight proxy can be run standalone so the AI Agent
Service can be exercised end-to-end without depending on the gateway
being ready.

Behaviour:
  * Accepts WebSocket connections at  ws://localhost:8011/ai/stream/{task_id}
  * Proxies them to                   ws://localhost:8007/ai/stream/{task_id}
    (the AI Agent Service running on its native port).
  * Forwards every message in both directions verbatim — no
    transformation, no buffering, no filtering — so frontend tests see
    exactly the same frames they would see if connected directly.
  * Emits a one-line JSON log per connection lifecycle event so it is
    obvious during a demo whether the proxy is wired up.

Run:
    python3 services/ai-agent/scripts/ai_ws_gateway.py

Configurable via env vars:
    AI_GATEWAY_PORT            (default 8011)
    AI_AGENT_HOST              (default 127.0.0.1)
    AI_AGENT_PORT              (default 8007)

Out of scope (intentionally):
    * REST proxying       — frontend already calls 8007 directly for REST
    * auth / rate limit   — class demo, not production
    * non-AI routes       — covered by the real gateway
"""
from __future__ import annotations

import asyncio
import json
import os
import sys

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import websockets

AI_GATEWAY_PORT = int(os.getenv("AI_GATEWAY_PORT", "8011"))
AI_AGENT_HOST = os.getenv("AI_AGENT_HOST", "127.0.0.1")
AI_AGENT_PORT = int(os.getenv("AI_AGENT_PORT", "8007"))

app = FastAPI(title="AI Gateway Proxy (port 8011)")


def _log(event: str, **fields: object) -> None:
    """One-line JSON log so the proxy is easy to follow during a demo."""
    payload = {"event": event, **fields}
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


@app.get("/health")
async def health() -> dict[str, object]:
    """Quick liveness check so it's obvious the gateway is up."""
    return {
        "status": "ok",
        "service": "ai-gateway-proxy",
        "upstream": f"ws://{AI_AGENT_HOST}:{AI_AGENT_PORT}",
        "ws_route": "/ai/stream/{task_id}",
    }


@app.websocket("/ai/stream/{task_id}")
async def proxy_ai_stream(client_ws: WebSocket, task_id: str) -> None:
    """Proxy a WebSocket from the frontend to the AI Agent Service.

    The frontend connects here; we open a parallel connection upstream
    and pump frames in both directions until either side disconnects.
    """
    await client_ws.accept()
    upstream_url = f"ws://{AI_AGENT_HOST}:{AI_AGENT_PORT}/ai/stream/{task_id}"
    _log("ws_connect", task_id=task_id, upstream=upstream_url)

    try:
        async with websockets.connect(upstream_url) as upstream_ws:

            async def upstream_to_client() -> None:
                try:
                    async for msg in upstream_ws:
                        if isinstance(msg, bytes):
                            await client_ws.send_bytes(msg)
                        else:
                            await client_ws.send_text(msg)
                except websockets.ConnectionClosed:
                    pass

            async def client_to_upstream() -> None:
                try:
                    while True:
                        msg = await client_ws.receive_text()
                        await upstream_ws.send(msg)
                except WebSocketDisconnect:
                    pass

            done, pending = await asyncio.wait(
                [
                    asyncio.create_task(upstream_to_client()),
                    asyncio.create_task(client_to_upstream()),
                ],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for t in pending:
                t.cancel()

    except (OSError, websockets.WebSocketException) as exc:
        # Upstream not reachable — surface that to the frontend so the UI
        # can render an error state instead of an indefinite spinner.
        try:
            await client_ws.send_json({
                "task_id": task_id,
                "step": "gateway",
                "status": "failed",
                "message": "AI gateway could not reach AI Agent Service",
                "progress": 0,
                "error": str(exc),
                "retryable": True,
            })
        except Exception:
            pass
        _log("ws_upstream_failed", task_id=task_id, error=str(exc))
    finally:
        try:
            await client_ws.close()
        except Exception:
            pass
        _log("ws_disconnect", task_id=task_id)


def main() -> None:
    _log(
        "gateway_start",
        port=AI_GATEWAY_PORT,
        upstream=f"ws://{AI_AGENT_HOST}:{AI_AGENT_PORT}",
    )
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=AI_GATEWAY_PORT,
        log_level="info",
    )


if __name__ == "__main__":
    main()
