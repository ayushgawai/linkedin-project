"""
Connections Router — Connection Service
POST /connections/request
POST /connections/accept
POST /connections/reject
POST /connections/list
POST /connections/mutual  (extra credit)
"""

import uuid
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select, text, func
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import Connection
from kafka_client import kafka_producer, build_envelope

log = logging.getLogger(__name__)
router = APIRouter()


# ── Request models ─────────────────────────────────────────────────────────────

class ConnectionRequestBody(BaseModel):
    requester_id: str
    receiver_id: str

class ActionRequestBody(BaseModel):
    request_id: str

class ListConnectionsBody(BaseModel):
    user_id: str
    page: int = 1
    page_size: int = 20

class MutualConnectionsBody(BaseModel):
    user_id: str
    other_id: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def success(data: dict) -> dict:
    return {"success": True, "data": data, "trace_id": str(uuid.uuid4())}

def error(code: str, message: str, status: int = 400):
    from fastapi import HTTPException
    raise HTTPException(status_code=status, detail={
        "success": False,
        "error": {"code": code, "message": message, "details": {}},
        "trace_id": str(uuid.uuid4()),
    })

def normalize_pair(a: str, b: str):
    """Always store as (min, max) to prevent duplicate pairs."""
    return (min(a, b), max(a, b))


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/request")
def request_connection(body: ConnectionRequestBody, db: Session = Depends(get_db)):
    """
    Send a connection request.
    - Normalizes pair to (min, max) to prevent duplicates
    - Returns 409 if already connected or pending request exists
    """
    if body.requester_id == body.receiver_id:
        error("VALIDATION_ERROR", "Cannot connect with yourself.")

    user_a, user_b = normalize_pair(body.requester_id, body.receiver_id)

    existing = db.execute(
        select(Connection).where(
            Connection.user_a == user_a,
            Connection.user_b == user_b,
        )
    ).scalar_one_or_none()

    if existing:
        if existing.status == "accepted":
            error("ALREADY_CONNECTED", "Users are already connected.", 409)
        elif existing.status == "pending":
            error("PENDING_REQUEST", "A connection request already exists.", 409)
        elif existing.status == "rejected":
            # Allow re-request after rejection
            existing.status = "pending"
            existing.requested_by = body.requester_id
            db.commit()
            db.refresh(existing)
            _produce_connection_event("connection.requested", body.requester_id, existing.connection_id, body)
            return success({"request_id": existing.connection_id, "status": "pending"})

    connection_id = str(uuid.uuid4())
    conn = Connection(
        connection_id=connection_id,
        user_a=user_a,
        user_b=user_b,
        status="pending",
        requested_by=body.requester_id,
    )
    db.add(conn)
    db.commit()

    _produce_connection_event("connection.requested", body.requester_id, connection_id, body)
    log.info(f"Connection request {connection_id} created: {user_a} <-> {user_b}")

    return success({"request_id": connection_id, "status": "pending"})


@router.post("/accept")
def accept_connection(body: ActionRequestBody, db: Session = Depends(get_db)):
    """
    Accept a pending connection request.
    Increments connections_count for BOTH users.
    """
    conn = db.get(Connection, body.request_id)
    if not conn:
        error("REQUEST_NOT_FOUND", f"Connection request {body.request_id} not found.", 404)
    if conn.status != "pending":
        error("INVALID_STATUS", f"Cannot accept a request with status '{conn.status}'.", 400)

    conn.status = "accepted"
    db.commit()

    # Increment connections_count for both users in members table
    try:
        db.execute(
            text("UPDATE members SET connections_count = connections_count + 1 WHERE member_id IN (:a, :b)"),
            {"a": conn.user_a, "b": conn.user_b},
        )
        db.commit()
    except Exception as e:
        log.warning(f"Could not update connections_count (members table may not exist yet): {e}")

    # Produce connection.accepted Kafka event
    envelope = build_envelope(
        event_type="connection.accepted",
        actor_id=conn.user_a,
        entity_type="connection",
        entity_id=conn.connection_id,
        payload={
            "connection_id": conn.connection_id,
            "user_a": conn.user_a,
            "user_b": conn.user_b,
        },
    )
    kafka_producer.produce("connection.accepted", envelope)

    log.info(f"Connection {body.request_id} accepted.")
    return success({"connected": True, "connection_id": conn.connection_id})


@router.post("/reject")
def reject_connection(body: ActionRequestBody, db: Session = Depends(get_db)):
    """Reject a pending connection request."""
    conn = db.get(Connection, body.request_id)
    if not conn:
        error("REQUEST_NOT_FOUND", f"Connection request {body.request_id} not found.", 404)
    if conn.status != "pending":
        error("INVALID_STATUS", f"Cannot reject a request with status '{conn.status}'.", 400)

    conn.status = "rejected"
    db.commit()

    log.info(f"Connection {body.request_id} rejected.")
    return success({"rejected": True})


@router.post("/list")
def list_connections(body: ListConnectionsBody, db: Session = Depends(get_db)):
    """List all accepted connections for a user."""
    offset = (body.page - 1) * body.page_size

    connections = db.execute(
        select(Connection).where(
            ((Connection.user_a == body.user_id) | (Connection.user_b == body.user_id)),
            Connection.status == "accepted",
        )
        .offset(offset)
        .limit(body.page_size)
    ).scalars().all()

    total = db.execute(
        select(func.count()).select_from(Connection).where(
            ((Connection.user_a == body.user_id) | (Connection.user_b == body.user_id)),
            Connection.status == "accepted",
        )
    ).scalar()

    results = []
    for c in connections:
        # The "other" user in the connection
        other_id = c.user_b if c.user_a == body.user_id else c.user_a
        results.append({
            "connection_id": c.connection_id,
            "connected_user_id": other_id,
            "connected_at": c.created_at.isoformat() if c.created_at else None,
        })

    return success({"connections": results, "total": total})


@router.post("/mutual")
def mutual_connections(body: MutualConnectionsBody, db: Session = Depends(get_db)):
    """
    Extra credit: Return mutual connections between two users.
    Uses a CTE-style subquery to find intersection of both users' connection sets.
    """
    def get_connection_ids(user_id: str):
        rows = db.execute(
            select(Connection).where(
                ((Connection.user_a == user_id) | (Connection.user_b == user_id)),
                Connection.status == "accepted",
            )
        ).scalars().all()
        ids = set()
        for c in rows:
            other = c.user_b if c.user_a == user_id else c.user_a
            ids.add(other)
        return ids

    user_connections = get_connection_ids(body.user_id)
    other_connections = get_connection_ids(body.other_id)
    mutual_ids = user_connections & other_connections

    return success({
        "mutual_connections": list(mutual_ids),
        "count": len(mutual_ids),
    })


# ── Internal helper ────────────────────────────────────────────────────────────

def _produce_connection_event(event_type: str, actor_id: str, connection_id: str, body):
    envelope = build_envelope(
        event_type=event_type,
        actor_id=actor_id,
        entity_type="connection",
        entity_id=connection_id,
        payload={
            "connection_id": connection_id,
            "requester_id": body.requester_id,
            "receiver_id": body.receiver_id,
        },
    )
    kafka_producer.produce("connection.requested", envelope)
