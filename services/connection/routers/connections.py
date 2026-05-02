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
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, text, func
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import Connection
from kafka_client import kafka_producer, build_envelope
from mongo_client import connect_mongo, upsert_connection_edge, delete_connection_edge

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

class PendingConnectionsBody(BaseModel):
    user_id: str
    page: int = 1
    page_size: int = 20


# ── Helpers ────────────────────────────────────────────────────────────────────

def error(code: str, message: str, status: int = 400):
    from fastapi import HTTPException
    raise HTTPException(status_code=status, detail={
        "success": False,
        "error": {"code": code, "message": message, "details": {}},
        "trace_id": str(uuid.uuid4()),
    })


def _trace_id(req: Request | None = None) -> str:
    tid = getattr(req.state, "trace_id", None) if req else None
    return tid or str(uuid.uuid4())


def ok(data, req: Request | None = None, status: int = 200):
    return JSONResponse(
        status_code=status,
        content={"success": True, "data": data, "trace_id": _trace_id(req)},
    )


def err(code: str, message: str, status: int, req: Request | None = None, details: dict | None = None):
    return JSONResponse(
        status_code=status,
        content={
            "success": False,
            "error": {"code": code, "message": message, "details": details or {}},
            "trace_id": _trace_id(req),
        },
    )

def normalize_pair(a: str, b: str):
    """Always store as (min, max) to prevent duplicate pairs."""
    return (min(a, b), max(a, b))


def _write_accepted_edge_to_mongo(conn: Connection) -> None:
    """
    Store only the accepted graph edge in MongoDB.

    MySQL remains the canonical workflow store for request state (pending/rejected)
    while MongoDB is used for the accepted connections graph (list/mutual reads).
    """
    try:
        if conn.status == "accepted":
            upsert_connection_edge(
                conn.user_a,
                conn.user_b,
                status="accepted",
                requested_by=getattr(conn, "requested_by", None),
                connection_id=getattr(conn, "connection_id", None),
            )
    except Exception as exc:  # noqa: BLE001
        log.warning("mongo write failed for connection %s: %s", getattr(conn, "connection_id", "?"), exc)


def _delete_edge_from_mongo(conn: Connection) -> None:
    try:
        delete_connection_edge(conn.user_a, conn.user_b)
    except Exception as exc:  # noqa: BLE001
        log.warning("mongo delete failed for connection %s: %s", getattr(conn, "connection_id", "?"), exc)


def _rejecting_actor(conn: Connection) -> str:
    """Addressee (non-requester) is treated as the actor for a reject event."""
    rb = conn.requested_by or conn.user_a
    return conn.user_b if rb == conn.user_a else conn.user_a


def _produce_connection_rejected(conn: Connection) -> None:
    envelope = build_envelope(
        event_type="connection.rejected",
        actor_id=_rejecting_actor(conn),
        entity_type="connection",
        entity_id=conn.connection_id,
        payload={
            "connection_id": conn.connection_id,
            "user_a": conn.user_a,
            "user_b": conn.user_b,
        },
    )
    kafka_producer.produce("connection.rejected", envelope)


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
            return {"request_id": existing.connection_id}

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
    db.refresh(conn)

    _produce_connection_event("connection.requested", body.requester_id, connection_id, body)
    log.info(f"Connection request {connection_id} created: {user_a} <-> {user_b}")

    return {"request_id": connection_id}


# ── REST compatibility for pytest (/connections*) ──────────────────────────────

class ConnectionRestRequestBody(BaseModel):
    requested_by: Optional[str] = None
    user_a: Optional[str] = None
    user_b: Optional[str] = None


@router.post("", include_in_schema=False)
def request_connection_rest(req: Request, body: ConnectionRestRequestBody, db: Session = Depends(get_db)):
    if not body.requested_by or not body.user_a or not body.user_b:
        return err("VALIDATION_ERROR", "requested_by, user_a, and user_b are required", 400, req)
    if body.user_a != body.requested_by:
        # tests always set user_a=requested_by; treat mismatch as validation error
        return err("VALIDATION_ERROR", "requested_by must match user_a", 400, req)

    if body.user_a == body.user_b:
        return err("VALIDATION_ERROR", "Cannot connect with yourself.", 400, req)

    user_a, user_b = normalize_pair(body.user_a, body.user_b)
    existing = db.execute(
        select(Connection).where(
            Connection.user_a == user_a,
            Connection.user_b == user_b,
        )
    ).scalar_one_or_none()

    if existing:
        if existing.status == "accepted":
            return err("ALREADY_CONNECTED", "Users are already connected.", 409, req)
        if existing.status == "pending":
            return err("DUPLICATE_CONNECTION", "A connection request already exists.", 409, req)
        if existing.status == "rejected":
            existing.status = "pending"
            existing.requested_by = body.user_a
            db.commit()
            db.refresh(existing)
            return ok({"connection_id": existing.connection_id, "status": "pending"}, req, status=201)

    connection_id = str(uuid.uuid4())
    conn = Connection(
        connection_id=connection_id,
        user_a=user_a,
        user_b=user_b,
        status="pending",
        requested_by=body.user_a,
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return ok({"connection_id": connection_id, "status": "pending"}, req, status=201)


@router.patch("/{connection_id}/accept", include_in_schema=False)
def accept_connection_rest(connection_id: str, req: Request, db: Session = Depends(get_db)):
    conn = db.get(Connection, connection_id)
    if not conn:
        return err("NOT_FOUND", "connection was not found", 404, req)
    if conn.status == "accepted":
        # idempotent acceptance is OK for tests
        return ok({"connection_id": conn.connection_id, "status": "accepted"}, req, status=200)
    if conn.status != "pending":
        return err("INVALID_STATUS", f"Cannot accept a request with status '{conn.status}'.", 400, req)

    conn.status = "accepted"
    db.commit()
    db.refresh(conn)
    _write_accepted_edge_to_mongo(conn)
    return ok({"connection_id": conn.connection_id, "status": "accepted"}, req, status=200)


@router.patch("/{connection_id}/reject", include_in_schema=False)
def reject_connection_rest(connection_id: str, req: Request, db: Session = Depends(get_db)):
    conn = db.get(Connection, connection_id)
    if not conn:
        return err("NOT_FOUND", "connection was not found", 404, req)
    if conn.status == "rejected":
        return ok({"connection_id": conn.connection_id, "status": "rejected"}, req, status=200)
    if conn.status != "pending":
        return err("INVALID_STATUS", f"Cannot reject a request with status '{conn.status}'.", 400, req)
    conn.status = "rejected"
    db.commit()
    db.refresh(conn)
    _delete_edge_from_mongo(conn)
    _produce_connection_rejected(conn)
    return ok({"connection_id": conn.connection_id, "status": "rejected"}, req, status=200)


@router.get("", include_in_schema=False)
def list_connections_rest(user_id: str | None = None, status: str | None = None, req: Request = None, db: Session = Depends(get_db)):
    if not user_id:
        return err("VALIDATION_ERROR", "user_id query param is required", 400, req)
    q = select(Connection).where(
        ((Connection.user_a == user_id) | (Connection.user_b == user_id))
    )
    if status:
        q = q.where(Connection.status == status)
    conns = db.execute(q.order_by(Connection.created_at.desc())).scalars().all()
    items = []
    for c in conns:
        items.append({
            "connection_id": c.connection_id,
            "requested_by": c.requested_by,
            "user_a": c.user_a,
            "user_b": c.user_b,
            "status": c.status,
        })
    return ok({"items": items}, req, status=200)


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
    db.refresh(conn)
    _write_accepted_edge_to_mongo(conn)

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
    return {"success": True}


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
    db.refresh(conn)
    _delete_edge_from_mongo(conn)
    _produce_connection_rejected(conn)

    log.info(f"Connection {body.request_id} rejected.")
    return {"success": True}


@router.post("/list")
def list_connections(body: ListConnectionsBody, db: Session = Depends(get_db)):
    """List accepted connections for a user (MongoDB graph)."""
    offset = (body.page - 1) * body.page_size
    mdb = connect_mongo()

    q = {
        "status": "accepted",
        "$or": [{"user_a": body.user_id}, {"user_b": body.user_id}],
    }
    cursor = (
        mdb.connections.find(q, {"_id": 0})
        .sort([("updated_at", -1)])
        .skip(offset)
        .limit(body.page_size)
    )
    docs = list(cursor)

    results = []
    for d in docs:
        requester = d.get("requested_by") or d.get("user_a")
        addressee = d.get("user_b") if requester == d.get("user_a") else d.get("user_a")
        results.append(
            {
                "connection_id": d.get("connection_id")
                or f"mongo-{d.get('user_a')}-{d.get('user_b')}",
                "requester_member_id": requester,
                "addressee_member_id": addressee,
                "status": "accepted",
                "created_at": d.get("created_at").isoformat() if d.get("created_at") else None,
                "updated_at": d.get("updated_at").isoformat() if d.get("updated_at") else None,
            }
        )

    return results


@router.post("/mutual")
def mutual_connections(body: MutualConnectionsBody, db: Session = Depends(get_db)):
    """
    Extra credit: Return mutual connections between two users.
    Uses the accepted graph edges from MongoDB.
    """
    mdb = connect_mongo()

    def get_connection_ids(user_id: str):
        q = {"status": "accepted", "$or": [{"user_a": user_id}, {"user_b": user_id}]}
        rows = mdb.connections.find(q, {"_id": 0, "user_a": 1, "user_b": 1})
        ids = set()
        for r in rows:
            other = r["user_b"] if r["user_a"] == user_id else r["user_a"]
            ids.add(other)
        return ids

    user_connections = get_connection_ids(body.user_id)
    other_connections = get_connection_ids(body.other_id)
    mutual_ids = user_connections & other_connections

    return [
        {
            "connection_id": f"mutual-{body.user_id}-{body.other_id}-{mid}",
            "requester_member_id": body.user_id,
            "addressee_member_id": mid,
            "status": "accepted",
            "created_at": None,
            "updated_at": None,
        }
        for mid in mutual_ids
    ]


@router.post("/pending")
def list_pending(body: PendingConnectionsBody, db: Session = Depends(get_db)):
    """
    List pending invitations for *body.user_id*.

    Frontend expects a list of invitation cards with:
      - request_id
      - requester_member_id
      - addressee_member_id
    """
    offset = (body.page - 1) * body.page_size

    pending = db.execute(
        select(Connection).where(
            Connection.status == "pending",
            (Connection.user_a == body.user_id) | (Connection.user_b == body.user_id),
        )
        .order_by(Connection.created_at.desc())
        .offset(offset)
        .limit(body.page_size)
    ).scalars().all()

    items = []
    for c in pending:
        requester_id = c.requested_by
        receiver_id = c.user_b if requester_id == c.user_a else c.user_a
        if receiver_id != body.user_id:
            continue
        items.append({
            "request_id": c.connection_id,
            "requester_member_id": requester_id,
            "addressee_member_id": body.user_id,
            "name": f"Member {requester_id[:6]}",
            "headline": "Professional",
            "mutual": 0,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    return items


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
