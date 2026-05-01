"""
Kafka Client — Messaging Service
Handles produce to message.sent topic with outbox fallback.
"""

import uuid
import json
import hashlib
import logging
import asyncio
import os
from datetime import datetime, timezone
from confluent_kafka import Producer, Consumer, KafkaException

log = logging.getLogger(__name__)

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "localhost:9092")


def build_envelope(event_type: str, actor_id: str, entity_type: str, entity_id: str, payload: dict) -> dict:
    """Build the standard Kafka envelope as defined in the project contract (Part 4)."""
    key_str = f"{event_type}:{actor_id}:{entity_id}"
    idempotency_key = hashlib.sha256(key_str.encode()).hexdigest()
    return {
        "event_type": event_type,
        "trace_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "actor_id": actor_id,
        "entity": {
            "entity_type": entity_type,
            "entity_id": entity_id,
        },
        "payload": payload,
        "idempotency_key": idempotency_key,
    }


class KafkaProducerClient:
    def __init__(self):
        self._producer = None

    async def start(self):
        try:
            self._producer = Producer({"bootstrap.servers": KAFKA_BROKERS})
            log.info("Kafka producer connected.")
        except Exception as e:
            log.warning(f"Kafka producer could not connect: {e}. Outbox fallback will be used.")
            self._producer = None

    async def stop(self):
        if self._producer:
            self._producer.flush(timeout=5)

    def produce(self, topic: str, envelope: dict) -> bool:
        """
        Produce a message to Kafka.
        Returns True on success, False on failure (caller should use outbox fallback).
        """
        if not self._producer:
            log.warning("Kafka producer not available.")
            return False

        retries = 3
        delay = 1
        for attempt in range(1, retries + 1):
            try:
                self._producer.produce(
                    topic,
                    key=envelope.get("idempotency_key"),
                    value=json.dumps(envelope).encode("utf-8"),
                )
                self._producer.flush(timeout=5)
                log.info(f"Produced to {topic}: trace_id={envelope.get('trace_id')}")
                return True
            except KafkaException as e:
                log.warning(f"Kafka produce attempt {attempt}/{retries} failed: {e}")
                if attempt < retries:
                    import time
                    time.sleep(delay)
                    delay *= 2
        return False

    @property
    def is_connected(self) -> bool:
        return self._producer is not None


kafka_producer = KafkaProducerClient()
