"""
Messages Router — Messaging Service
POST /messages/send
POST /messages/list
"""

import uuid
import json
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import Message, ThreadParticipant, OutboxEvent
from kafka_client import kafka_producer, build_envelope

log = logging.getLogger(__name__)
router = APIRouter()


# ── Request models ─────────────────────────────────────────────────────────────

class SendMessageRequest(BaseModel):
    thread_id: str
    sender_id: str
    # Frontend sends `text`; professor spec uses `message_text`. Accept both.
    message_text: Optional[str] = None
    text: Optional[str] = None
    idempotency_key: Optional[str] = None

class ListMessagesRequest(BaseModel):
    thread_id: str
    page: int = 1
    page_size: int = 50


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


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/send")
def send_message(body: SendMessageRequest, db: Session = Depends(get_db)):
    """
    Send a message in a thread.
    - Validates thread exists and sender is a participant
    - Writes message to DB first (guaranteed)
    - Produces to Kafka message.sent topic
    - If Kafka unavailable: stores in outbox_events for retry
    """
    # Validate thread exists
    participant = db.execute(
        select(ThreadParticipant).where(
            ThreadParticipant.thread_id == body.thread_id,
            ThreadParticipant.user_id == body.sender_id,
        )
    ).scalar_one_or_none()

    if not participant:
        # Check if thread exists at all
        any_participant = db.execute(
            select(ThreadParticipant).where(ThreadParticipant.thread_id == body.thread_id)
        ).first()
        if not any_participant:
            error("THREAD_NOT_FOUND", f"Thread {body.thread_id} not found.", 404)
        else:
            error("FORBIDDEN", "Sender is not a participant in this thread.", 403)

    message_text = (body.message_text or body.text or "").strip()

    # Validate message content
    if not message_text:
        error("VALIDATION_ERROR", "message_text cannot be empty.")

    # Write message to DB
    message_id = str(uuid.uuid4())
    msg = Message(
        message_id=message_id,
        thread_id=body.thread_id,
        sender_id=body.sender_id,
        message_text=message_text,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    log.info(f"Message {message_id} saved to DB.")

    # Build Kafka envelope
    envelope = build_envelope(
        event_type="message.sent",
        actor_id=body.sender_id,
        entity_type="thread",
        entity_id=body.thread_id,
        payload={
            "message_id": message_id,
            "thread_id": body.thread_id,
            "sender_id": body.sender_id,
            "message_text": message_text,
        },
    )

    # Produce to Kafka — fall back to outbox if unavailable
    kafka_ok = kafka_producer.produce("message.sent", envelope)

    if not kafka_ok:
        log.warning(f"Kafka unavailable — storing message {message_id} in outbox.")
        outbox_entry = OutboxEvent(
            topic="message.sent",
            envelope=json.dumps(envelope),
            sent=False,
        )
        db.add(outbox_entry)
        db.commit()
        # Still return 201 — message is in DB, will be delivered via outbox poller
        return success({"message_id": message_id, "kafka_status": "queued_in_outbox"})

    return success({"message_id": message_id, "kafka_status": "delivered"})


@router.post("/list")
def list_messages(body: ListMessagesRequest, db: Session = Depends(get_db)):
    """List paginated messages in a thread, ordered oldest first."""
    # Verify thread exists
    thread_exists = db.execute(
        select(ThreadParticipant).where(ThreadParticipant.thread_id == body.thread_id)
    ).first()
    if not thread_exists:
        error("THREAD_NOT_FOUND", f"Thread {body.thread_id} not found.", 404)

    offset = (body.page - 1) * body.page_size

    messages = db.execute(
        select(Message)
        .where(Message.thread_id == body.thread_id)
        .order_by(Message.sent_at.asc())
        .offset(offset)
        .limit(body.page_size)
    ).scalars().all()

    total = db.execute(
        select(Message).where(Message.thread_id == body.thread_id)
    ).scalars().__class__

    # Count total
    from sqlalchemy import func
    total_count = db.execute(
        select(func.count()).select_from(Message).where(Message.thread_id == body.thread_id)
    ).scalar()

    return success({
        "messages": [
            {
                "message_id": m.message_id,
                "thread_id": m.thread_id,
                "sender_id": m.sender_id,
                "message_text": m.message_text,
                "text": m.message_text,
                "sent_at": m.sent_at.isoformat() if m.sent_at else None,
            }
            for m in messages
        ],
        "total": total_count,
        "page": body.page,
        "page_size": body.page_size,
    })
