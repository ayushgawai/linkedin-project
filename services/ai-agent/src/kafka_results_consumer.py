"""Kafka consumer for the ``ai.results`` topic.

Its single responsibility: subscribe to ``ai.results`` and broadcast each
message to any WebSocket client watching the same ``task_id``.

This decouples the supervisor (which writes to MongoDB + produces Kafka)
from the WebSocket transport: the Kafka topic is the single source of
truth for "what has happened to this task," and every AI-service replica
subscribes independently so its own WS clients stay in sync.

Consumer group choice: each replica uses a UNIQUE group ID so that
every replica receives every message. A shared group would partition
messages across replicas, which would prevent WS clients attached to
replica B from seeing events produced by replica A.
"""
from __future__ import annotations

import asyncio
import json
import os
import socket
import threading
import uuid
from typing import Any

from loguru import logger

from .config import get_settings
from .ws_manager import manager as ws_manager

try:
    from confluent_kafka import Consumer, KafkaError
    _KAFKA_AVAILABLE = True
except ImportError:  # pragma: no cover
    _KAFKA_AVAILABLE = False


class KafkaResultsConsumer:
    """Background thread: poll ai.results and broadcast to WS clients."""

    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self._consumer: Any = None
        self._running = False
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if not _KAFKA_AVAILABLE:
            logger.warning("confluent-kafka unavailable — results consumer not started")
            return

        settings = get_settings()
        # Unique group per process → each replica sees every message
        unique_suffix = f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:6]}"
        group_id = f"ai-results-broadcaster-{unique_suffix}"

        conf = {
            "bootstrap.servers": settings.kafka_brokers,
            "group.id": group_id,
            # Read only new messages — historical ones are already in MongoDB
            "auto.offset.reset": "latest",
            # We don't need commits — this is a broadcast consumer, state is WS-only
            "enable.auto.commit": True,
            "socket.timeout.ms": 5000,
        }
        try:
            self._consumer = Consumer(conf)
            self._consumer.subscribe([settings.kafka_topic_results])
            logger.info(
                "Results consumer subscribed to '{}' (group: {})",
                settings.kafka_topic_results, group_id,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Results consumer init failed: {}", exc)
            return

        self._running = True
        self._thread = threading.Thread(
            target=self._poll_loop, daemon=True, name="kafka-results-consumer"
        )
        self._thread.start()

    def _poll_loop(self) -> None:
        """Blocking poll loop — runs in a background thread."""
        while self._running:
            try:
                msg = self._consumer.poll(timeout=1.0)
            except Exception as exc:  # noqa: BLE001
                logger.error("Results consumer poll error: {}", exc)
                continue

            if msg is None:
                continue

            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                logger.error("Results consumer error: {}", msg.error())
                continue

            try:
                envelope = json.loads(msg.value().decode("utf-8"))
            except json.JSONDecodeError as exc:
                logger.warning("Results consumer failed to decode message: {}", exc)
                continue

            # Extract the payload fields that the WS client cares about
            payload = envelope.get("payload") or {}
            task_id = payload.get("task_id") or envelope.get("entity", {}).get("entity_id", "")
            if not task_id:
                continue

            # Only broadcast if someone is actually listening
            if ws_manager.active_count(task_id) == 0:
                continue

            frame = {
                "task_id": task_id,
                "trace_id": envelope.get("trace_id", ""),
                "event_type": envelope.get("event_type", ""),
                "step": payload.get("step", ""),
                "status": payload.get("step_status", ""),
                "partial_result": payload.get("partial_result"),
                "timestamp": envelope.get("timestamp", ""),
            }

            # Hand the broadcast off to the FastAPI asyncio loop
            asyncio.run_coroutine_threadsafe(
                ws_manager.broadcast_to_task(task_id, frame), self._loop
            )

    def is_alive(self) -> bool:
        """Return True if the background thread is still polling."""
        return bool(self._thread and self._thread.is_alive() and self._running)

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        if self._consumer:
            try:
                self._consumer.close()
            except Exception:  # noqa: BLE001
                pass
            logger.info("Results consumer closed")
