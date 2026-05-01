import os
import logging
from datetime import datetime, timezone

from pymongo import MongoClient

log = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "linkedinclone")

_client: MongoClient | None = None
_db = None


def connect_mongo():
    global _client, _db
    if _db is not None:
        return _db
    _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5_000, maxPoolSize=20)
    _db = _client[MONGO_DB]
    try:
        _db.command({"ping": 1})
        log.info("Mongo connected for connection-service")
    except Exception as exc:  # noqa: BLE001
        log.warning("Mongo ping failed for connection-service: %s", exc)
    # Ensure indexes (idempotent)
    try:
        _db.connections.create_index([("user_a", 1), ("user_b", 1)], unique=True)
        _db.connections.create_index([("status", 1), ("updated_at", -1)])
        _db.connections.create_index([("requested_by", 1), ("updated_at", -1)])
    except Exception as exc:  # noqa: BLE001
        log.warning("Mongo index ensure failed for connection-service: %s", exc)
    return _db


def close_mongo():
    global _client, _db
    if _client is not None:
        try:
            _client.close()
        except Exception:
            pass
    _client = None
    _db = None


def upsert_connection_edge(user_a: str, user_b: str, *, status: str, requested_by: str | None, connection_id: str | None):
    """
    Mirror connection state into MongoDB connections collection.
    Uses (user_a, user_b) as unique key; stores status + timestamps.
    """
    db = connect_mongo()
    now = datetime.now(timezone.utc)
    doc = {
        "user_a": user_a,
        "user_b": user_b,
        "status": status,
        "requested_by": requested_by,
        "connection_id": connection_id,
        "updated_at": now,
    }
    db.connections.update_one(
        {"user_a": user_a, "user_b": user_b},
        {"$set": doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )


def delete_connection_edge(user_a: str, user_b: str):
    db = connect_mongo()
    db.connections.delete_one({"user_a": user_a, "user_b": user_b})

