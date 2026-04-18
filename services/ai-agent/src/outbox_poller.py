"""Outbox retry poller.

Periodically scans the ``ai_outbox`` collection for undelivered Kafka
messages (broker was down when they were originally produced) and retries
them via the shared :class:`KafkaProducer`.

Each message has an ``attempts`` counter; after ``MAX_ATTEMPTS`` failed
deliveries it stays in the collection but is flagged as ``permanent_failure``
so it can be investigated manually instead of retried forever.
"""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import TYPE_CHECKING

from loguru import logger

from .db import get_outbox

if TYPE_CHECKING:
    from .kafka_producer import KafkaProducer

POLL_INTERVAL_SECONDS = 30
MAX_ATTEMPTS = 10
BATCH_SIZE = 50


class OutboxPoller:
    """Background asyncio task that drains the outbox."""

    def __init__(self, producer: "KafkaProducer") -> None:
        self._producer = producer
        self._task: asyncio.Task[None] | None = None
        self._stopped = asyncio.Event()

    def start(self) -> None:
        """Launch the poller as an asyncio task."""
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._run(), name="outbox-poller")
        logger.info("Outbox poller started (interval={}s)", POLL_INTERVAL_SECONDS)

    async def stop(self) -> None:
        """Signal the poller to stop and wait briefly for it."""
        self._stopped.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=5)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()
        logger.info("Outbox poller stopped")

    async def _run(self) -> None:
        """Main loop — drains undelivered messages every POLL_INTERVAL."""
        while not self._stopped.is_set():
            try:
                await self._drain_once()
            except Exception as exc:  # noqa: BLE001
                logger.error("Outbox drain error: {}", exc)

            # Sleep but wake immediately on stop
            try:
                await asyncio.wait_for(self._stopped.wait(), timeout=POLL_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                continue

    async def _drain_once(self) -> None:
        """Attempt delivery of up to BATCH_SIZE undelivered messages."""
        outbox = get_outbox()
        cursor = outbox.find(
            {"delivered": False, "attempts": {"$lt": MAX_ATTEMPTS}},
            sort=[("created_at", 1)],
            limit=BATCH_SIZE,
        )
        pending = list(cursor)
        if not pending:
            return

        logger.info("Outbox drain: {} pending messages", len(pending))
        for msg in pending:
            topic = msg["topic"]
            value = msg["value"]
            key = msg.get("key")
            attempts = msg.get("attempts", 0) + 1

            # Only one produce attempt per poll cycle — rely on the poller's
            # cadence rather than the producer's internal retries to back off.
            # Use max_retries=1 so we don't double-sleep inside produce().
            # from_outbox=True prevents produce() from writing *another*
            # outbox row when the replay itself fails — the poller updates
            # the existing row below.
            delivered = self._producer.produce(
                topic, value, key=key, max_retries=1, from_outbox=True,
            )

            update: dict = {
                "$inc": {"attempts": 1},
                "$set": {"last_attempt_at": datetime.utcnow()},
            }
            if delivered:
                update["$set"]["delivered"] = True
                update["$set"]["delivered_at"] = datetime.utcnow()
            elif attempts >= MAX_ATTEMPTS:
                update["$set"]["permanent_failure"] = True
                update["$set"]["last_error"] = "max_attempts_exceeded"
                logger.error(
                    "Outbox message reached MAX_ATTEMPTS — manual review required: _id={}",
                    msg.get("_id"),
                )
            else:
                update["$set"]["last_error"] = "produce_failed"

            outbox.update_one({"_id": msg["_id"]}, update)

            if delivered:
                logger.info(
                    "Outbox delivered: topic={} attempts={} _id={}",
                    topic, attempts, msg.get("_id"),
                )
