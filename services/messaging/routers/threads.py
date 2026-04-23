"""
Threads Router — Messaging Service
POST /threads/open
POST /threads/get
POST /threads/byUser
"""

import uuid
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select, and_
from pydantic import BaseModel
from typing import List

from database import get_db
from models import Thread, ThreadParticipant, Message

log = logging.getLogger(__name__)
router = APIRouter()


# ── Request / Response models ──────────────────────────────────────────────────

class OpenThreadRequest(BaseModel):
    participant_ids: List[str]

class GetThreadRequest(BaseModel):
    thread_id: str

class ThreadsByUserRequest(BaseModel):
    user_id: str
    page: int = 1
    page_size: int = 20


# ── Helpers ────────────────────────────────────────────────────────────────────

def success(data: dict) -> dict:
    return {"success": True, "data": data, "trace_id": str(uuid.uuid4())}

def error(code: str, message: str, status: int = 400) -> dict:
    from fastapi import HTTPException
    raise HTTPException(status_code=status, detail={
        "success": False,
        "error": {"code": code, "message": message, "details": {}},
        "trace_id": str(uuid.uuid4()),
    })


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/open")
def open_thread(body: OpenThreadRequest, db: Session = Depends(get_db)):
    """
    Open a thread between participants.
    Idempotent — returns existing thread if one already exists between the same pair.
    """
    if len(body.participant_ids) < 2:
        error("VALIDATION_ERROR", "At least 2 participant_ids required.")

    # Sort participant IDs so (A,B) and (B,A) resolve to the same thread
    sorted_ids = sorted(body.participant_ids)

    # Check if thread already exists between these participants
    # Find threads where ALL sorted_ids are participants
    existing_thread_id = None

    # Get all threads for first participant
    threads_for_p1 = db.execute(
        select(ThreadParticipant.thread_id).where(ThreadParticipant.user_id == sorted_ids[0])
    ).scalars().all()

    for tid in threads_for_p1:
        # Check if all other participants are in this thread too
        participants_in_thread = db.execute(
            select(ThreadParticipant.user_id).where(ThreadParticipant.thread_id == tid)
        ).scalars().all()
        if set(sorted_ids) == set(participants_in_thread):
            existing_thread_id = tid
            break

    if existing_thread_id:
        log.info(f"Thread already exists: {existing_thread_id}")
        return success({"thread_id": existing_thread_id, "created": False})

    # Create new thread
    thread_id = str(uuid.uuid4())
    db.add(Thread(thread_id=thread_id))
    for uid in sorted_ids:
        db.add(ThreadParticipant(thread_id=thread_id, user_id=uid))
    db.commit()

    log.info(f"Created thread {thread_id} for participants {sorted_ids}")
    return success({"thread_id": thread_id, "created": True})


@router.post("/get")
def get_thread(body: GetThreadRequest, db: Session = Depends(get_db)):
    """Get thread metadata + participant list."""
    thread = db.get(Thread, body.thread_id)
    if not thread:
        error("THREAD_NOT_FOUND", f"Thread {body.thread_id} not found.", 404)

    participants = db.execute(
        select(ThreadParticipant.user_id).where(ThreadParticipant.thread_id == body.thread_id)
    ).scalars().all()

    return success({
        "thread_id": thread.thread_id,
        "created_at": thread.created_at.isoformat() if thread.created_at else None,
        "participants": list(participants),
    })


@router.post("/byUser")
def threads_by_user(body: ThreadsByUserRequest, db: Session = Depends(get_db)):
    """Get all threads for a user with last message preview."""
    thread_ids = db.execute(
        select(ThreadParticipant.thread_id).where(ThreadParticipant.user_id == body.user_id)
    ).scalars().all()

    if not thread_ids:
        return success({"threads": [], "total": 0})

    offset = (body.page - 1) * body.page_size
    paginated_ids = thread_ids[offset: offset + body.page_size]

    results = []
    for tid in paginated_ids:
        # Get participants
        participants = db.execute(
            select(ThreadParticipant.user_id).where(ThreadParticipant.thread_id == tid)
        ).scalars().all()

        # Get last message
        last_msg = db.execute(
            select(Message)
            .where(Message.thread_id == tid)
            .order_by(Message.sent_at.desc())
            .limit(1)
        ).scalar_one_or_none()

        results.append({
            "thread_id": tid,
            "participants": list(participants),
            "last_message": {
                "text": last_msg.message_text[:100] if last_msg else None,
                "sender_id": last_msg.sender_id if last_msg else None,
                "sent_at": last_msg.sent_at.isoformat() if last_msg and last_msg.sent_at else None,
            }
        })

    return success({"threads": results, "total": len(thread_ids)})
