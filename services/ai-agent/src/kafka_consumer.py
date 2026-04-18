"""Kafka consumer for the ai.requests topic.

Runs in a background daemon thread. Each message is dispatched to the
HiringAssistantSupervisor for processing.  Kafka offsets are committed
only *after* the task has been written to MongoDB (at-least-once with
idempotent processing).
"""
from __future__ import annotations

import asyncio
import json
import threading
from typing import TYPE_CHECKING, Any

from loguru import logger

from .config import get_settings

if TYPE_CHECKING:
    from .supervisor import HiringAssistantSupervisor

try:
    from confluent_kafka import Consumer, KafkaError, KafkaException
    _KAFKA_AVAILABLE = True
except ImportError:  # pragma: no cover
    _KAFKA_AVAILABLE = False


class KafkaRequestsConsumer:
    """Background thread that polls ai.requests and hands work to the supervisor."""

    def __init__(
        self,
        supervisor: "HiringAssistantSupervisor",
        loop: asyncio.AbstractEventLoop,
    ) -> None:
        self._supervisor = supervisor
        self._loop = loop
        self._consumer: Any = None
        self._running = False
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        """Start the consumer in a daemon thread."""
        if not _KAFKA_AVAILABLE:
            logger.warning("confluent-kafka unavailable — consumer not started")
            return

        settings = get_settings()
        conf = {
            "bootstrap.servers": settings.kafka_brokers,
            "group.id": settings.kafka_consumer_group,
            "auto.offset.reset": "earliest",
            # Disable auto-commit — we commit manually after MongoDB write
            "enable.auto.commit": False,
            "socket.timeout.ms": 5000,
        }
        try:
            self._consumer = Consumer(conf)
            self._consumer.subscribe([settings.kafka_topic_requests])
            logger.info(
                "Kafka consumer subscribed to '{}' (group: {})",
                settings.kafka_topic_requests,
                settings.kafka_consumer_group,
            )
        except Exception as exc:
            logger.error("Kafka consumer init failed: {}", exc)
            return

        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True, name="kafka-consumer")
        self._thread.start()

    def _poll_loop(self) -> None:
        """Blocking poll loop — runs in a background thread."""
        while self._running:
            try:
                msg = self._consumer.poll(timeout=1.0)
            except Exception as exc:  # noqa: BLE001
                logger.error("Kafka poll error: {}", exc)
                continue

            if msg is None:
                continue

            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    # End of partition — not an error
                    continue
                logger.error("Kafka consumer error: {}", msg.error())
                continue

            try:
                payload = json.loads(msg.value().decode("utf-8"))
            except json.JSONDecodeError as exc:
                # Poison message — cannot be processed even with retries.
                # Route to DLQ (if configured) and commit so we don't loop forever.
                logger.error("Failed to decode Kafka message (poison): {}", exc)
                self._route_to_dlq(msg.value(), reason=f"json_decode_error: {exc}")
                self._consumer.commit(message=msg, asynchronous=False)
                continue

            logger.info(
                "Received ai.requests message: event_type={} trace_id={}",
                payload.get("event_type"),
                payload.get("trace_id"),
            )

            # Schedule coroutine in the asyncio event loop from this sync thread.
            future = asyncio.run_coroutine_threadsafe(
                self._supervisor.process_task(payload), self._loop
            )
            processed_ok = False
            try:
                # Wait up to 120 seconds for the task to finish before committing
                future.result(timeout=120)
                processed_ok = True
            except asyncio.TimeoutError:
                logger.error(
                    "Supervisor task timed out (trace_id={}) — offset NOT committed; will redeliver",
                    payload.get("trace_id"),
                )
            except Exception as exc:  # noqa: BLE001
                logger.error(
                    "Supervisor task raised exception (trace_id={}): {} — offset NOT committed",
                    payload.get("trace_id"), exc,
                )

            if processed_ok:
                # Commit offset ONLY after successful MongoDB write inside process_task.
                # Kafka will redeliver on crash/timeout; supervisor is idempotent via processed_events.
                try:
                    self._consumer.commit(message=msg, asynchronous=False)
                except Exception as exc:  # noqa: BLE001
                    logger.error("Kafka commit failed: {}", exc)

    def _route_to_dlq(self, raw_value: bytes, reason: str) -> None:
        """Attempt to route a poison message to the DLQ topic (best-effort)."""
        try:
            from .config import get_settings
            from confluent_kafka import Producer as _P
            settings = get_settings()
            dlq_topic = f"{settings.kafka_topic_requests}.dlq"
            p = _P({"bootstrap.servers": settings.kafka_brokers})
            p.produce(dlq_topic, value=raw_value, headers=[("failure_reason", reason.encode())])
            p.flush(timeout=5)
            logger.info("Routed poison message to DLQ: {}", dlq_topic)
        except Exception as exc:  # noqa: BLE001
            logger.warning("DLQ route failed (dropping message): {}", exc)

    def is_alive(self) -> bool:
        """Return True if the background poll thread is still running."""
        return bool(self._thread and self._thread.is_alive() and self._running)

    def stop(self) -> None:
        """Signal the poll loop to stop and close the consumer."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        if self._consumer:
            self._consumer.close()
            logger.info("Kafka consumer closed")
