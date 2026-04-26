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
_starred_threads_by_user: dict[str, set[str]] = {}
_deleted_threads_by_user: dict[str, set[str]] = {}


# ── Request / Response models ──────────────────────────────────────────────────

class OpenThreadRequest(BaseModel):
    participant_ids: List[str]

class GetThreadRequest(BaseModel):
    thread_id: str

class ThreadsByUserRequest(BaseModel):
    user_id: str
    page: int = 1
    page_size: int = 20


class ThreadUserActionRequest(BaseModel):
    thread_id: str
    user_id: str


# ── Helpers ────────────────────────────────────────────────────────────────────

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
        return {"thread_id": existing_thread_id}

    # Create new thread
    thread_id = str(uuid.uuid4())
    db.add(Thread(thread_id=thread_id))
    for uid in sorted_ids:
        db.add(ThreadParticipant(thread_id=thread_id, user_id=uid))
    db.commit()

    log.info(f"Created thread {thread_id} for participants {sorted_ids}")
    return {"thread_id": thread_id}


@router.post("/get")
def get_thread(body: GetThreadRequest, db: Session = Depends(get_db)):
    """Get thread metadata + participant list."""
    thread = db.get(Thread, body.thread_id)
    if not thread:
        error("THREAD_NOT_FOUND", f"Thread {body.thread_id} not found.", 404)

    participants = db.execute(
        select(ThreadParticipant.user_id).where(ThreadParticipant.thread_id == body.thread_id)
    ).scalars().all()

    fallback_participant = participants[0] if participants else ""
    return {
        "thread_id": thread.thread_id,
        "participant": {
            "member_id": fallback_participant,
            "full_name": f"Member {fallback_participant[:8]}" if fallback_participant else "Unknown",
            "headline": "",
            "profile_photo_url": None,
            "online": False,
        },
        "last_message_preview": "",
        "last_message_time": "",
        "unread_count": 0,
        "starred": False,
    }


@router.post("/byUser")
def threads_by_user(body: ThreadsByUserRequest, db: Session = Depends(get_db)):
    """Get all threads for a user with last message preview."""
    thread_ids = db.execute(
        select(ThreadParticipant.thread_id).where(ThreadParticipant.user_id == body.user_id)
    ).scalars().all()

    if not thread_ids:
        return []

    offset = (body.page - 1) * body.page_size
    paginated_ids = thread_ids[offset: offset + body.page_size]

    results = []
    deleted_threads = _deleted_threads_by_user.get(body.user_id, set())
    starred_threads = _starred_threads_by_user.get(body.user_id, set())
    for tid in paginated_ids:
        if tid in deleted_threads:
            continue
        # Get participants
        participants = db.execute(
            select(ThreadParticipant.user_id).where(ThreadParticipant.thread_id == tid)
        ).scalars().all()
        other_user = next((p for p in participants if p != body.user_id), body.user_id)

        # Get last message
        last_msg = db.execute(
            select(Message)
            .where(Message.thread_id == tid)
            .order_by(Message.sent_at.desc())
            .limit(1)
        ).scalar_one_or_none()

        results.append({
            "thread_id": tid,
            "participant": {
                "member_id": other_user,
                "full_name": f"Member {other_user[:8]}",
                "headline": "",
                "profile_photo_url": None,
                "online": False,
            }
            ,
            "last_message_preview": (last_msg.message_text[:100] if last_msg else "No messages yet"),
            "last_message_time": (last_msg.sent_at.isoformat() if last_msg and last_msg.sent_at else ""),
            "unread_count": 0,
            "starred": tid in starred_threads,
        })

    return results


@router.post("/deleteForUser")
def delete_thread_for_user(body: ThreadUserActionRequest, db: Session = Depends(get_db)):
    thread = db.get(Thread, body.thread_id)
    if not thread:
        error("THREAD_NOT_FOUND", f"Thread {body.thread_id} not found.", 404)
    _deleted_threads_by_user.setdefault(body.user_id, set()).add(body.thread_id)
    return {"ok": True}


@router.post("/star")
def star_thread(body: ThreadUserActionRequest, db: Session = Depends(get_db)):
    thread = db.get(Thread, body.thread_id)
    if not thread:
        error("THREAD_NOT_FOUND", f"Thread {body.thread_id} not found.", 404)
    stars = _starred_threads_by_user.setdefault(body.user_id, set())
    if body.thread_id in stars:
        stars.remove(body.thread_id)
        return {"starred": False}
    stars.add(body.thread_id)
    return {"starred": True}
