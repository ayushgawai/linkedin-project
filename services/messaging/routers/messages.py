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
from pydantic import BaseModel, Field
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
    text: Optional[str] = None
    message_text: Optional[str] = None
    idempotency_key: Optional[str] = None
    image_url: Optional[str] = None
    attachment_url: Optional[str] = None
    attachment_filename: Optional[str] = None

class ListMessagesRequest(BaseModel):
    thread_id: str
    page: int = 1
    page_size: int = Field(default=50, alias="pageSize")


class MarkReadRequest(BaseModel):
    thread_id: str
    reader_id: str


class EditMessageRequest(BaseModel):
    thread_id: str
    message_id: str
    editor_id: str
    text: str


class DeleteMessageRequest(BaseModel):
    thread_id: str
    message_id: str
    user_id: str


# ── Helpers ────────────────────────────────────────────────────────────────────

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

    # Validate message content
    message_text = (body.text or body.message_text or "").strip()
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
            "idempotency_key": body.idempotency_key or message_id,
            "image_url": body.image_url,
            "attachment_url": body.attachment_url,
            "attachment_filename": body.attachment_filename,
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
        return {
            "message_id": message_id,
            "thread_id": body.thread_id,
            "sender_id": body.sender_id,
            "sender_name": f"Member {body.sender_id[:8]}",
            "text": message_text,
            "sent_at": msg.sent_at.isoformat() if msg.sent_at else None,
            "status": "sent",
            "idempotency_key": body.idempotency_key or message_id,
            "image_url": body.image_url,
            "attachment_url": body.attachment_url,
            "attachment_filename": body.attachment_filename,
        }

    return {
        "message_id": message_id,
        "thread_id": body.thread_id,
        "sender_id": body.sender_id,
        "sender_name": f"Member {body.sender_id[:8]}",
        "text": message_text,
        "sent_at": msg.sent_at.isoformat() if msg.sent_at else None,
        "status": "delivered",
        "idempotency_key": body.idempotency_key or message_id,
        "image_url": body.image_url,
        "attachment_url": body.attachment_url,
        "attachment_filename": body.attachment_filename,
    }


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

    from sqlalchemy import func
    total_count = db.execute(
        select(func.count()).select_from(Message).where(Message.thread_id == body.thread_id)
    ).scalar()

    returned = [
        {
            "message_id": m.message_id,
            "thread_id": m.thread_id,
            "sender_id": m.sender_id,
            "sender_name": f"Member {m.sender_id[:8]}",
            "text": m.message_text,
            "sent_at": m.sent_at.isoformat() if m.sent_at else None,
            "status": "delivered",
        }
        for m in messages
    ]

    return {
        "messages": returned,
        "has_more": (offset + len(returned)) < (total_count or 0),
    }


@router.post("/markRead")
def mark_read(body: MarkReadRequest, db: Session = Depends(get_db)):
    # Compatibility endpoint for frontend; no-op until unread tracking is persisted.
    thread_exists = db.execute(
        select(ThreadParticipant).where(ThreadParticipant.thread_id == body.thread_id)
    ).first()
    if not thread_exists:
        error("THREAD_NOT_FOUND", f"Thread {body.thread_id} not found.", 404)
    return {"ok": True}


@router.post("/edit")
def edit_message(body: EditMessageRequest, db: Session = Depends(get_db)):
    message = db.execute(
        select(Message).where(
            Message.message_id == body.message_id,
            Message.thread_id == body.thread_id,
        )
    ).scalar_one_or_none()
    if not message:
        error("MESSAGE_NOT_FOUND", f"Message {body.message_id} not found.", 404)
    if message.sender_id != body.editor_id:
        error("FORBIDDEN", "Only sender can edit this message.", 403)
    if not body.text.strip():
        error("VALIDATION_ERROR", "text cannot be empty.")

    message.message_text = body.text.strip()
    db.commit()
    db.refresh(message)
    return {
        "message_id": message.message_id,
        "thread_id": message.thread_id,
        "sender_id": message.sender_id,
        "sender_name": f"Member {message.sender_id[:8]}",
        "text": message.message_text,
        "sent_at": message.sent_at.isoformat() if message.sent_at else None,
        "edited_at": message.sent_at.isoformat() if message.sent_at else None,
        "status": "delivered",
    }


@router.post("/delete")
def delete_message(body: DeleteMessageRequest, db: Session = Depends(get_db)):
    message = db.execute(
        select(Message).where(
            Message.message_id == body.message_id,
            Message.thread_id == body.thread_id,
        )
    ).scalar_one_or_none()
    if not message:
        error("MESSAGE_NOT_FOUND", f"Message {body.message_id} not found.", 404)
    if message.sender_id != body.user_id:
        error("FORBIDDEN", "Only sender can delete this message.", 403)

    db.delete(message)
    db.commit()
    return {"ok": True}
