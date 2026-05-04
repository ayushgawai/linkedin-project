"""
Lightweight online presence for messaging — in-process last-seen map.
POST /presence/heartbeat  { "user_id": "<member id>" }
"""

import time
import threading
from pydantic import BaseModel
from fastapi import APIRouter

router = APIRouter()

# Seconds after last heartbeat before a member is considered offline.
PRESENCE_TTL_SEC = 75.0

_lock = threading.Lock()
_last_seen: dict[str, float] = {}


def record_presence(user_id: str) -> None:
    if not user_id or not str(user_id).strip():
        return
    uid = str(user_id).strip()
    now = time.monotonic()
    with _lock:
        _last_seen[uid] = now


def member_is_online(user_id: str | None) -> bool:
    if not user_id or not str(user_id).strip():
        return False
    uid = str(user_id).strip()
    now = time.monotonic()
    with _lock:
        last = _last_seen.get(uid)
    if last is None:
        return False
    return (now - last) < PRESENCE_TTL_SEC


class HeartbeatBody(BaseModel):
    user_id: str


@router.post("/heartbeat")
def presence_heartbeat(body: HeartbeatBody):
    record_presence(body.user_id)
    return {"ok": True}
