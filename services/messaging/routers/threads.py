"""
Threads Router — Messaging Service
POST /threads/open
POST /threads/get
POST /threads/byUser
"""

import uuid
import logging
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, and_
from pydantic import BaseModel
from typing import List

from database import get_db
from models import Thread, ThreadParticipant, Message
from routers.presence import member_is_online

log = logging.getLogger(__name__)
router = APIRouter()
_starred_threads_by_user: dict[str, set[str]] = {}
_deleted_threads_by_user: dict[str, set[str]] = {}


# ── Request / Response models ──────────────────────────────────────────────────

class OpenThreadRequest(BaseModel):
    participant_ids: List[str] | None = None
    # Frontend/gateway compatibility: allow { user_a, user_b } too.
    user_a: str | None = None
    user_b: str | None = None

class GetThreadRequest(BaseModel):
    thread_id: str
    user_id: str | None = None

class ThreadsByUserRequest(BaseModel):
    user_id: str
    page: int = 1
    page_size: int = 20


class ThreadUserActionRequest(BaseModel):
    thread_id: str
    user_id: str


# ── Helpers ────────────────────────────────────────────────────────────────────

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


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/open")
def open_thread(body: OpenThreadRequest, db: Session = Depends(get_db)):
    """
    Open a thread between participants.
    Idempotent — returns existing thread if one already exists between the same pair.
    """
    participant_ids = body.participant_ids or []
    if (not participant_ids) and body.user_a and body.user_b:
        participant_ids = [body.user_a, body.user_b]

    if len(participant_ids) < 2:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="At least 2 participant_ids required.")

    # Sort participant IDs so (A,B) and (B,A) resolve to the same thread
    sorted_ids = sorted(participant_ids)

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


# ── REST compatibility for pytest (/threads*) ──────────────────────────────────

class OpenThreadRestRequest(BaseModel):
    participants: List[str] | None = None


@router.post("", include_in_schema=False)
def open_thread_rest(req: Request, body: OpenThreadRestRequest, db: Session = Depends(get_db)):
    participants = body.participants or []
    if len(participants) < 2:
        return err("VALIDATION_ERROR", "participants must contain at least 2 ids", 400, req)

    sorted_ids = sorted(participants)

    # Find existing thread (idempotent)
    existing_thread_id = None
    threads_for_p1 = db.execute(
        select(ThreadParticipant.thread_id).where(ThreadParticipant.user_id == sorted_ids[0])
    ).scalars().all()
    for tid in threads_for_p1:
        participants_in_thread = db.execute(
            select(ThreadParticipant.user_id).where(ThreadParticipant.thread_id == tid)
        ).scalars().all()
        if set(sorted_ids) == set(participants_in_thread):
            existing_thread_id = tid
            break

    if existing_thread_id:
        return ok({"thread_id": existing_thread_id}, req, status=200)

    thread_id = str(uuid.uuid4())
    db.add(Thread(thread_id=thread_id))
    for uid in sorted_ids:
        db.add(ThreadParticipant(thread_id=thread_id, user_id=uid))
    db.commit()
    return ok({"thread_id": thread_id}, req, status=201)


@router.get("/{thread_id}", include_in_schema=False)
def get_thread_rest(thread_id: str, req: Request, db: Session = Depends(get_db)):
    thread = db.get(Thread, thread_id)
    if not thread:
        return err("NOT_FOUND", "thread was not found", 404, req)
    participants = db.execute(
        select(ThreadParticipant.user_id).where(ThreadParticipant.thread_id == thread_id)
    ).scalars().all()
    return ok({"thread_id": thread_id, "participants": participants}, req)


@router.get("", include_in_schema=False)
def threads_by_user_rest(user_id: str | None = None, req: Request = None, db: Session = Depends(get_db)):
    if not user_id:
        return err("VALIDATION_ERROR", "user_id query param is required", 400, req)
    thread_ids = db.execute(
        select(ThreadParticipant.thread_id).where(ThreadParticipant.user_id == user_id)
    ).scalars().all()
    items = [{"thread_id": tid} for tid in thread_ids]
    return ok({"items": items}, req)


@router.get("/{thread_id}/messages", include_in_schema=False)
def list_messages_rest(thread_id: str, req: Request, db: Session = Depends(get_db)):
    thread_exists = db.execute(
        select(ThreadParticipant).where(ThreadParticipant.thread_id == thread_id)
    ).first()
    if not thread_exists:
        return err("NOT_FOUND", "thread was not found", 404, req)
    messages = db.execute(
        select(Message).where(Message.thread_id == thread_id).order_by(Message.sent_at.asc())
    ).scalars().all()
    items = [
        {
            "message_id": m.message_id,
            "thread_id": m.thread_id,
            "sender_id": m.sender_id,
            "message_text": m.message_text,
            "sent_at": m.sent_at.isoformat() if m.sent_at else None,
        }
        for m in messages
    ]
    return ok({"items": items}, req)


class SendMessageRestRequest(BaseModel):
    sender_id: str | None = None
    message_text: str | None = None


@router.post("/{thread_id}/messages", include_in_schema=False)
def send_message_rest(thread_id: str, req: Request, body: SendMessageRestRequest, db: Session = Depends(get_db)):
    if not body.sender_id or not body.message_text or not body.message_text.strip():
        return err("VALIDATION_ERROR", "sender_id and message_text are required", 400, req)
    participant = db.execute(
        select(ThreadParticipant).where(
            ThreadParticipant.thread_id == thread_id,
            ThreadParticipant.user_id == body.sender_id,
        )
    ).scalar_one_or_none()
    if not participant:
        any_participant = db.execute(
            select(ThreadParticipant).where(ThreadParticipant.thread_id == thread_id)
        ).first()
        if not any_participant:
            return err("NOT_FOUND", "thread was not found", 404, req)
        return err("FORBIDDEN", "sender is not a participant", 403, req)

    message_id = str(uuid.uuid4())
    msg = Message(
        message_id=message_id,
        thread_id=thread_id,
        sender_id=body.sender_id,
        message_text=body.message_text.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return ok(
        {"message_id": message_id, "thread_id": thread_id, "sender_id": body.sender_id, "message_text": msg.message_text},
        req,
        status=201,
    )


@router.post("/get")
def get_thread(body: GetThreadRequest, db: Session = Depends(get_db)):
    """Get thread metadata + participant list."""
    thread = db.get(Thread, body.thread_id)
    if not thread:
        error("THREAD_NOT_FOUND", f"Thread {body.thread_id} not found.", 404)

    participants = db.execute(
        select(ThreadParticipant.user_id).where(ThreadParticipant.thread_id == body.thread_id)
    ).scalars().all()

    viewer = (body.user_id or "").strip() or None
    if viewer and viewer in participants:
        other_id = next((p for p in participants if p != viewer), participants[0] if participants else "")
    else:
        other_id = participants[0] if participants else ""
    return {
        "thread_id": thread.thread_id,
        "participant": {
            "member_id": other_id,
            "full_name": f"Member {other_id[:8]}" if other_id else "Unknown",
            "headline": "",
            "profile_photo_url": None,
            "online": member_is_online(other_id),
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
                "online": member_is_online(other_user),
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
