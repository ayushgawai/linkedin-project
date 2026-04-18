"""MongoDB connection, collection accessors, and index setup."""
from __future__ import annotations

from loguru import logger
from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from .config import get_settings

_client: MongoClient | None = None


def get_client() -> MongoClient:
    """Return (or create) the shared MongoClient singleton."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=3000)
        logger.info("MongoDB client created ({})", settings.mongo_uri)
    return _client


def get_db() -> Database:
    """Return the linkedinclone database handle."""
    return get_client()[get_settings().mongo_db]


def get_ai_traces() -> Collection:
    """Return the ai_traces collection (one document per AI task)."""
    return get_db()["ai_traces"]


def get_processed_events() -> Collection:
    """
    Return the processed_events collection — append-only ledger of consumed
    Kafka messages keyed by ``idempotency_key`` (unique).
    """
    return get_db()["ai_processed_events"]


def get_outbox() -> Collection:
    """
    Return the outbox collection — durable queue of Kafka messages that
    failed to produce (broker unavailable, retries exhausted).

    A background poller replays these until delivery succeeds.
    """
    return get_db()["ai_outbox"]


def ensure_indexes() -> None:
    """
    Idempotently create the indexes this service relies on.

    Safe to call on every startup — MongoDB treats identical index specs as no-ops.
    """
    try:
        traces = get_ai_traces()
        traces.create_index([("task_id", ASCENDING)], unique=True, name="uq_task_id")
        traces.create_index([("trace_id", ASCENDING)], name="idx_trace_id")
        traces.create_index([("status", ASCENDING), ("created_at", ASCENDING)], name="idx_status_created")
        traces.create_index([("recruiter_id", ASCENDING), ("created_at", ASCENDING)], name="idx_recruiter")

        pe = get_processed_events()
        pe.create_index(
            [("idempotency_key", ASCENDING)],
            unique=True,
            name="uq_idempotency_key",
        )
        pe.create_index([("trace_id", ASCENDING)], name="idx_pe_trace_id")

        ob = get_outbox()
        ob.create_index([("created_at", ASCENDING)], name="idx_outbox_created")
        ob.create_index([("delivered", ASCENDING), ("attempts", ASCENDING)], name="idx_outbox_pending")
        logger.info("MongoDB indexes ensured")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to ensure indexes: {}", exc)


STALE_CLAIM_SECONDS = 300  # 5 min — retry a crashed in-progress claim after this


class IdempotencyLedgerError(Exception):
    """Raised when the processed-events ledger is unavailable or errors.

    This is *different* from "already claimed by a prior delivery" — that
    case returns False from :func:`claim_idempotency_key` and is a normal
    skip. This exception means we could not determine the claim state at
    all, so the caller must NOT commit the Kafka offset; a later
    redelivery will retry once the ledger is healthy.
    """


def claim_idempotency_key(
    idempotency_key: str,
    task_id: str,
    trace_id: str,
) -> bool:
    """
    Two-phase idempotency claim.

    Phase 1 (this function): atomically insert a claim with
    ``status="in_progress"``. The unique index on ``idempotency_key`` is
    what makes this atomic across replicas.

    Phase 2: call :func:`finalize_idempotency_key` once the task has
    actually completed (successfully or via a terminal failure). That
    flips the claim to ``status="completed"``.

    Crash-safety: if a claim exists but is still ``in_progress`` and
    older than ``STALE_CLAIM_SECONDS``, we assume the previous worker
    died mid-flight and take over the claim. This prevents the
    "claim-before-process" trap where a crash leaks forever.

    Returns:
        True  — this delivery should proceed (fresh claim OR stale takeover)
        False — a previous delivery already completed this key; skip
    """
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    pe = get_processed_events()
    try:
        pe.insert_one({
            "idempotency_key": idempotency_key,
            "task_id": task_id,
            "trace_id": trace_id,
            "status": "in_progress",
            "claimed_at": now,
            "completed_at": None,
            "attempt": 1,
        })
        return True
    except DuplicateKeyError:
        # A claim exists. Decide based on its current state.
        existing = pe.find_one({"idempotency_key": idempotency_key})
        if not existing:
            # Race: row vanished between insert and find — treat as free.
            return True
        if existing.get("status") == "completed":
            return False
        # in_progress: check for staleness so a crashed worker doesn't
        # block the key forever.
        claimed_at = existing.get("claimed_at")
        if not isinstance(claimed_at, datetime) or \
                (now - claimed_at) > timedelta(seconds=STALE_CLAIM_SECONDS):
            res = pe.update_one(
                {
                    "idempotency_key": idempotency_key,
                    "status": "in_progress",
                    # Guard against another replica already taking over.
                    "claimed_at": claimed_at,
                },
                {
                    "$set": {
                        "claimed_at": now,
                        "trace_id": trace_id,
                        "task_id": task_id,
                    },
                    "$inc": {"attempt": 1},
                },
            )
            if res.modified_count == 1:
                logger.warning(
                    "Took over stale in_progress claim idempotency_key={} (previous "
                    "worker likely crashed)",
                    idempotency_key,
                )
                return True
            # Someone else took over in the meantime — skip.
            return False
        # Fresh in-progress claim by another worker — skip.
        return False
    except Exception as exc:  # noqa: BLE001
        # Fail CLOSED. Raise so the Kafka consumer does NOT commit the
        # offset — a later redelivery retries once Mongo is healthy.
        logger.error(
            "claim_idempotency_key write failed for key={}: {}",
            idempotency_key, exc,
        )
        raise IdempotencyLedgerError(
            f"ledger unavailable for key={idempotency_key}"
        ) from exc


def finalize_idempotency_key(idempotency_key: str) -> None:
    """Mark a previously claimed key as ``completed``.

    Must be called exactly once per successful or terminally-failed
    processing run. After this returns, any redelivery of the same key
    will be skipped by :func:`claim_idempotency_key`.
    """
    from datetime import datetime
    try:
        get_processed_events().update_one(
            {"idempotency_key": idempotency_key},
            {"$set": {"status": "completed", "completed_at": datetime.utcnow()}},
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("finalize_idempotency_key failed for {}: {}", idempotency_key, exc)


def check_db_connection() -> bool:
    """Ping MongoDB; return True if reachable."""
    try:
        get_client().admin.command("ping")
        return True
    except Exception as exc:
        logger.warning("MongoDB ping failed: {}", exc)
        return False


def close_client() -> None:
    """Close the MongoClient (called on app shutdown)."""
    global _client
    if _client is not None:
        _client.close()
        _client = None
        logger.info("MongoDB client closed")
