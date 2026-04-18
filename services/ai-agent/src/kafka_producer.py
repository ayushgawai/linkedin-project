"""Kafka producer wrapper with retry + exponential backoff."""
from __future__ import annotations

import json
import time
from typing import Any

from loguru import logger

from .config import get_settings

try:
    from confluent_kafka import Producer, KafkaException
    _KAFKA_AVAILABLE = True
except ImportError:  # pragma: no cover
    _KAFKA_AVAILABLE = False
    logger.warning("confluent-kafka not installed; Kafka produce calls will be no-ops")


class KafkaProducer:
    """Thread-safe Kafka producer with retry logic."""

    def __init__(self) -> None:
        self._producer: Any = None
        self._connected: bool = False
        self._init()

    def _init(self) -> None:
        if not _KAFKA_AVAILABLE:
            return
        settings = get_settings()
        conf = {
            "bootstrap.servers": settings.kafka_brokers,
            "socket.timeout.ms": 5000,
            "message.send.max.retries": 3,
        }
        try:
            self._producer = Producer(conf)
            self._connected = True
            logger.info("Kafka producer connected to {}", settings.kafka_brokers)
        except Exception as exc:
            logger.error("Kafka producer init failed: {}", exc)

    def produce(
        self,
        topic: str,
        value: dict[str, Any],
        key: str | None = None,
        max_retries: int = 3,
        *,
        from_outbox: bool = False,
    ) -> bool:
        """
        Serialize *value* to JSON and produce to *topic*.

        Retries up to *max_retries* times with exponential backoff.
        Returns True on success, False after all retries exhausted.

        Args:
            from_outbox: Set True when the caller is the outbox poller
                replaying a stored message. Prevents a failed replay from
                creating a second outbox row for the same payload — the
                poller updates the existing row itself.
        """
        if not _KAFKA_AVAILABLE or not self._connected or self._producer is None:
            # Kafka is unavailable (not installed, init failed, or never
            # connected). Persist to outbox so the message isn't silently
            # lost. The outbox poller will retry once the broker is healthy.
            if not from_outbox:
                logger.warning(
                    "Kafka unavailable — writing to outbox for topic={}", topic,
                )
                self._write_to_outbox(topic, value, key)
            return False

        payload = json.dumps(value).encode("utf-8")
        encoded_key = key.encode("utf-8") if key else None

        for attempt in range(1, max_retries + 1):
            try:
                self._producer.produce(
                    topic,
                    value=payload,
                    key=encoded_key,
                    on_delivery=self._delivery_report,
                )
                self._producer.flush(timeout=5)
                return True
            except Exception as exc:  # noqa: BLE001
                wait = 2 ** attempt
                logger.warning(
                    "Kafka produce attempt {}/{} failed ({}). Retrying in {}s…",
                    attempt, max_retries, exc, wait,
                )
                if attempt < max_retries:
                    time.sleep(wait)

        logger.error("Kafka produce failed after {} retries on topic {}", max_retries, topic)
        # Durable fallback — persist the envelope so the outbox poller
        # can replay it when the broker is healthy again. Skipped when
        # *we* are the outbox poller, otherwise replays accumulate
        # duplicate outbox rows forever.
        if not from_outbox:
            self._write_to_outbox(topic, value, key)
        return False

    @staticmethod
    def _write_to_outbox(topic: str, value: dict[str, Any], key: str | None) -> None:
        """Persist a failed Kafka message for later replay."""
        try:
            # Lazy import to avoid DB dependency when Kafka works normally
            from datetime import datetime
            from .db import get_outbox
            get_outbox().insert_one({
                "topic": topic,
                "key": key,
                "value": value,
                "created_at": datetime.utcnow(),
                "attempts": 0,
                "delivered": False,
                "last_error": None,
                "last_attempt_at": None,
            })
            logger.info("Outbox write ok for topic={} (will retry later)", topic)
        except Exception as exc:  # noqa: BLE001
            # If both Kafka and Mongo are down, we've truly lost the message.
            # Log loudly so ops sees it.
            logger.error("Outbox write FAILED — message lost: {}", exc)

    @staticmethod
    def _delivery_report(err: Any, msg: Any) -> None:
        if err:
            logger.error("Kafka delivery failed: {}", err)
        else:
            logger.debug(
                "Kafka delivered to {}[{}] offset {}",
                msg.topic(), msg.partition(), msg.offset(),
            )

    def is_connected(self) -> bool:
        """Check if the producer is connected by fetching metadata."""
        if not _KAFKA_AVAILABLE or self._producer is None:
            return False
        try:
            self._producer.list_topics(timeout=2)
            return True
        except Exception:
            return False

    def close(self) -> None:
        if self._producer:
            self._producer.flush(timeout=5)
            logger.info("Kafka producer flushed and closed")
