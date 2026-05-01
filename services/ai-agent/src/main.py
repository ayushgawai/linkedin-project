"""FastAPI application entry point for the AI Agent Service (port 8007).

Routes:
  GET  /health
  POST /ai/request
  POST /ai/status
  POST /ai/approve
  WS   /ai/stream/{task_id}
  POST /ai/skills/parse-resume
  POST /ai/skills/match
  POST /ai/coach
"""
from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from .config import get_settings
from .db import check_db_connection, close_client, ensure_indexes, get_ai_traces
from .kafka_consumer import KafkaRequestsConsumer
from .kafka_producer import KafkaProducer
from .kafka_results_consumer import KafkaResultsConsumer
from .logging_config import configure_logging
from .outbox_poller import OutboxPoller
from .kafka_events import build_request_envelope
from .models import (
    AIApproveBody,
    AIApproveResponse,
    AIRequestBody,
    AIStatusBody,
    AIStatusResponse,
    ApprovalAction,
    CoachRequest,
    CoachResponse,
    MatchRequest,
    ParseResumeRequest,
    StepRecord,
    StepStatus,
    TaskStatus,
)
from .service_clients import send_outreach_message
from .supervisor import HiringAssistantSupervisor
from .ws_manager import manager as ws_manager

# ---------------------------------------------------------------------------
# Module-level singletons (initialised in lifespan)
# ---------------------------------------------------------------------------

_kafka_producer: KafkaProducer | None = None
_kafka_consumer: KafkaRequestsConsumer | None = None
_kafka_results_consumer: KafkaResultsConsumer | None = None
_outbox_poller: OutboxPoller | None = None
_supervisor: HiringAssistantSupervisor | None = None


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    """Start/stop infrastructure on application startup/shutdown."""
    global _kafka_producer, _kafka_consumer, _kafka_results_consumer, _outbox_poller, _supervisor

    # Structured JSON logging — install before anything else logs.
    configure_logging()

    logger.info("AI Agent Service starting up…")

    # Ensure MongoDB indexes (safe to call repeatedly)
    ensure_indexes()

    # Kafka producer
    _kafka_producer = KafkaProducer()

    # Supervisor
    _supervisor = HiringAssistantSupervisor(_kafka_producer)

    loop = asyncio.get_running_loop()

    # Requests consumer — pulls from ai.requests, dispatches to supervisor
    _kafka_consumer = KafkaRequestsConsumer(_supervisor, loop)
    _kafka_consumer.start()

    # Results consumer — pulls from ai.results and broadcasts to WebSocket clients.
    # This is the single source of WS frames, replacing the supervisor's in-process
    # broadcast (so every replica's WS clients see the same stream).
    _kafka_results_consumer = KafkaResultsConsumer(loop)
    _kafka_results_consumer.start()

    # Outbox poller — retries Kafka messages that couldn't be delivered when first produced.
    _outbox_poller = OutboxPoller(_kafka_producer)
    _outbox_poller.start()

    logger.info("AI Agent Service ready on port {}", get_settings().service_port)
    yield

    # Shutdown
    logger.info("AI Agent Service shutting down…")
    if _outbox_poller:
        await _outbox_poller.stop()
    if _kafka_consumer:
        _kafka_consumer.stop()
    if _kafka_results_consumer:
        _kafka_results_consumer.stop()
    if _kafka_producer:
        _kafka_producer.close()
    close_client()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

settings = get_settings()

app = FastAPI(
    title="LinkedInClone AI Agent Service",
    description="Agentic AI service for hiring assistance, resume parsing, and candidate matching.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ok(data: Any, trace_id: str | None = None) -> dict[str, Any]:
    return {"success": True, "data": data, "trace_id": trace_id or str(uuid.uuid4())}


def _err(code: str, message: str, details: dict[str, Any] | None = None, trace_id: str | None = None) -> dict[str, Any]:
    return {
        "success": False,
        "error": {"code": code, "message": message, "details": details or {}},
        "trace_id": trace_id or str(uuid.uuid4()),
    }


def _get_supervisor() -> HiringAssistantSupervisor:
    if _supervisor is None:
        raise HTTPException(status_code=503, detail="Supervisor not initialised")
    return _supervisor


def _get_producer() -> KafkaProducer:
    if _kafka_producer is None:
        raise HTTPException(status_code=503, detail="Kafka producer not initialised")
    return _kafka_producer


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health", tags=["Health"])
def health() -> dict[str, str]:
    """Liveness + readiness check for MongoDB, Kafka producer, and both consumers."""
    db_status = "connected" if check_db_connection() else "disconnected"
    kafka_status = (
        "connected"
        if (_kafka_producer and _kafka_producer.is_connected())
        else "disconnected"
    )
    requests_consumer_status = (
        "alive"
        if (_kafka_consumer and _kafka_consumer.is_alive())
        else "down"
    )
    results_consumer_status = (
        "alive"
        if (_kafka_results_consumer and _kafka_results_consumer.is_alive())
        else "down"
    )

    overall = (
        "ok"
        if db_status == "connected"
        and kafka_status == "connected"
        and requests_consumer_status == "alive"
        and results_consumer_status == "alive"
        else "degraded"
    )
    return {
        "status": overall,
        "service": "ai-agent",
        "db": db_status,
        "kafka": kafka_status,
        "requests_consumer": requests_consumer_status,
        "results_consumer": results_consumer_status,
    }


# ---------------------------------------------------------------------------
# POST /ai/request
# ---------------------------------------------------------------------------


@app.post("/ai/request", tags=["AI Workflow"])
def ai_request(body: AIRequestBody) -> JSONResponse:
    """
    Submit a new AI task.

    Generates ``task_id`` + ``trace_id``, persists to MongoDB (status=pending),
    and publishes to ``ai.requests``. Returns **HTTP 202 Accepted**.
    """
    trace_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())

    producer = _get_producer()

    # Deterministic idempotency key based on task_id so retries of the same
    # envelope never double-process.
    idempotency_key = f"ai-task-{task_id}"

    # Persist task to MongoDB. Only write the fields relevant to the
    # task_type so the document shape is not cluttered for
    # shortlist/match tasks with parse/coach-specific nulls.
    try:
        doc: dict[str, Any] = {
            "task_id": task_id,
            "trace_id": trace_id,
            "recruiter_id": body.recruiter_id,
            "task_type": body.task_type.value,
            "status": TaskStatus.PENDING.value,
            "steps": [],
            "result": None,
            "idempotency_key": idempotency_key,
            "approvals": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        if body.job_id is not None:
            doc["job_id"] = body.job_id
        if body.member_id is not None:
            doc["member_id"] = body.member_id
        if body.target_job_id is not None:
            doc["target_job_id"] = body.target_job_id
        # resume_text can be large — store it so debugging/replay is
        # possible, but it's not required if the caller re-submits.
        if body.resume_text is not None:
            doc["resume_text"] = body.resume_text
        get_ai_traces().insert_one(doc)
    except Exception as exc:
        logger.error("MongoDB insert failed for ai/request: {}", exc)
        return JSONResponse(
            status_code=500,
            content=_err("DB_ERROR", "Failed to persist task", trace_id=trace_id),
        )

    # Build the Kafka payload with only the fields relevant to the task type.
    payload: dict[str, Any] = {
        "task_id": task_id,
        "recruiter_id": body.recruiter_id,
        "task_type": body.task_type.value,
    }
    if body.job_id is not None:
        payload["job_id"] = body.job_id
    if body.member_id is not None:
        payload["member_id"] = body.member_id
    if body.target_job_id is not None:
        payload["target_job_id"] = body.target_job_id
    if body.resume_text is not None:
        payload["resume_text"] = body.resume_text

    envelope = build_request_envelope(
        task_id=task_id,
        trace_id=trace_id,
        actor_id=body.recruiter_id,
        payload=payload,
        idempotency_key=idempotency_key,
    )

    ok = producer.produce(settings.kafka_topic_requests, envelope.model_dump(), key=task_id)
    if not ok:
        logger.warning(
            "Kafka produce failed for task_id={}; task persisted for later retry",
            task_id,
        )
        # Return 503 so caller knows the task may not be processed immediately
        return JSONResponse(
            status_code=503,
            content=_err(
                "KAFKA_UNAVAILABLE",
                "Task persisted but could not be queued; will retry",
                {"task_id": task_id, "trace_id": trace_id},
                trace_id=trace_id,
            ),
        )

    logger.info(
        "AI task created: task_id={} type={} job_id={} member_id={}",
        task_id, body.task_type, body.job_id, body.member_id,
    )
    return JSONResponse(
        status_code=202,
        content=_ok({"task_id": task_id, "trace_id": trace_id}, trace_id),
    )


# ---------------------------------------------------------------------------
# POST /ai/retry/{task_id}
# ---------------------------------------------------------------------------


@app.post("/ai/retry/{task_id}", tags=["AI Workflow"])
def ai_retry(task_id: str) -> JSONResponse:
    """
    Retry a failed or timed-out AI task.

    Looks up the original task in MongoDB, copies its inputs (task_type,
    job_id, member_id, target_job_id, resume_text, recruiter_id) into a
    fresh task with a new ``task_id`` and ``trace_id``, and re-publishes
    to ``ai.requests``. The new task carries a ``retry_of`` field linking
    it back to the original so traces stay correlated for debugging.

    Returns:
      202 Accepted with the NEW task_id and trace_id on success.
      404 if the original task does not exist.
      409 if the original task is not in a retryable state (already running
          or completed without failure).
      503 if Kafka is unavailable (task is persisted; outbox poller will retry).
    """
    try:
        original = get_ai_traces().find_one({"task_id": task_id}, {"_id": 0})
    except Exception as exc:  # noqa: BLE001
        logger.error("MongoDB query failed for ai/retry: {}", exc)
        return JSONResponse(
            status_code=500,
            content=_err("DB_ERROR", "Failed to read original task"),
        )

    if not original:
        return JSONResponse(
            status_code=404,
            content=_err("NOT_FOUND", f"Task {task_id} not found"),
        )

    original_status = original.get("status")
    if original_status not in ("failed", "timed_out"):
        return JSONResponse(
            status_code=409,
            content=_err(
                "NOT_RETRYABLE",
                f"Task {task_id} is in state '{original_status}'. Only failed/timed_out tasks can be retried.",
            ),
        )

    new_trace_id = str(uuid.uuid4())
    new_task_id = str(uuid.uuid4())
    idempotency_key = f"ai-task-{new_task_id}"

    doc: dict[str, Any] = {
        "task_id": new_task_id,
        "trace_id": new_trace_id,
        "recruiter_id": original.get("recruiter_id", ""),
        "task_type": original.get("task_type", "shortlist"),
        "status": TaskStatus.PENDING.value,
        "steps": [],
        "result": None,
        "idempotency_key": idempotency_key,
        "approvals": [],
        "retry_of": task_id,  # link back to the failed task for trace correlation
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    for k in ("job_id", "member_id", "target_job_id", "resume_text"):
        if original.get(k) is not None:
            doc[k] = original[k]

    try:
        get_ai_traces().insert_one(doc)
    except Exception as exc:  # noqa: BLE001
        logger.error("MongoDB insert failed for ai/retry: {}", exc)
        return JSONResponse(
            status_code=500,
            content=_err("DB_ERROR", "Failed to persist retry task", trace_id=new_trace_id),
        )

    payload: dict[str, Any] = {
        "task_id": new_task_id,
        "recruiter_id": original.get("recruiter_id", ""),
        "task_type": original.get("task_type", "shortlist"),
        "retry_of": task_id,
    }
    for k in ("job_id", "member_id", "target_job_id", "resume_text"):
        if original.get(k) is not None:
            payload[k] = original[k]

    envelope = build_request_envelope(
        task_id=new_task_id,
        trace_id=new_trace_id,
        actor_id=original.get("recruiter_id", "ai-retry"),
        payload=payload,
        idempotency_key=idempotency_key,
    )

    producer = _get_producer()
    ok = producer.produce(settings.kafka_topic_requests, envelope.model_dump(), key=new_task_id)
    if not ok:
        logger.warning("Kafka produce failed for retry task_id={}", new_task_id)
        return JSONResponse(
            status_code=503,
            content=_err(
                "KAFKA_UNAVAILABLE",
                "Retry task persisted but could not be queued; will retry",
                {"task_id": new_task_id, "trace_id": new_trace_id, "retry_of": task_id},
                trace_id=new_trace_id,
            ),
        )

    logger.info(
        "AI task retried: original={} new_task_id={} type={}",
        task_id, new_task_id, original.get("task_type"),
    )
    return JSONResponse(
        status_code=202,
        content=_ok(
            {"task_id": new_task_id, "trace_id": new_trace_id, "retry_of": task_id},
            new_trace_id,
        ),
    )


# ---------------------------------------------------------------------------
# POST /ai/status
# ---------------------------------------------------------------------------


@app.post("/ai/status", tags=["AI Workflow"])
def ai_status(body: AIStatusBody) -> JSONResponse:
    """Return the current status and step log for a task."""
    try:
        doc = get_ai_traces().find_one({"task_id": body.task_id}, {"_id": 0})
    except Exception as exc:
        logger.error("MongoDB query failed for ai/status: {}", exc)
        return JSONResponse(
            status_code=500,
            content=_err("DB_ERROR", "Failed to query task status"),
        )

    if not doc:
        return JSONResponse(
            status_code=404,
            content=_err("NOT_FOUND", f"Task {body.task_id} not found"),
        )

    trace_id = doc.get("trace_id", str(uuid.uuid4()))
    steps: list[StepRecord] = []
    for s in doc.get("steps", []):
        try:
            steps.append(StepRecord(
                step=s["step"],
                status=StepStatus(s.get("status", "running")),
                timestamp=s.get("timestamp", datetime.utcnow()),
                partial_result=s.get("partial_result"),
            ))
        except Exception:
            # Skip malformed step records instead of blowing up
            continue

    response = AIStatusResponse(
        task_id=body.task_id,
        status=TaskStatus(doc.get("status", "pending")),
        steps=steps,
        result=doc.get("result"),
    )
    return JSONResponse(status_code=200, content=_ok(response.model_dump(mode="json"), trace_id))


# ---------------------------------------------------------------------------
# POST /ai/approve
# ---------------------------------------------------------------------------


@app.post("/ai/approve", tags=["AI Workflow"])
async def ai_approve(body: AIApproveBody) -> JSONResponse:
    """
    Record a recruiter's per-candidate decision on a shortlisted outreach draft.

    Side effects by action:
      - approve: sends the stored outreach draft via the Messaging Service
      - edit:    sends the recruiter-edited message via the Messaging Service
      - reject:  records rejection; no message is sent
    """
    traces = get_ai_traces()

    try:
        doc = traces.find_one({"task_id": body.task_id}, {"_id": 0})
    except Exception as exc:
        logger.error("MongoDB query failed for ai/approve: {}", exc)
        return JSONResponse(
            status_code=500,
            content=_err("DB_ERROR", "Failed to load task"),
        )

    if not doc:
        return JSONResponse(
            status_code=404,
            content=_err("NOT_FOUND", f"Task {body.task_id} not found"),
        )

    # State check: task must be completed and have a shortlist
    if doc.get("status") != TaskStatus.COMPLETED.value:
        return JSONResponse(
            status_code=409,
            content=_err(
                "INVALID_STATE",
                f"Task is {doc.get('status')}; approval requires status=completed",
            ),
        )

    shortlist = (doc.get("result") or {}).get("shortlist") or []
    match_entry = next((s for s in shortlist if s.get("member_id") == body.member_id), None)
    if match_entry is None:
        return JSONResponse(
            status_code=404,
            content=_err(
                "CANDIDATE_NOT_IN_SHORTLIST",
                f"member_id {body.member_id} not in task {body.task_id} shortlist",
            ),
        )

    # Validate edit has content up-front. (Terminal-duplicate detection
    # happens atomically in the claim step below, not via a read-then-write
    # race here.)
    if body.action == ApprovalAction.EDIT and not (body.edited_content or "").strip():
        return JSONResponse(
            status_code=400,
            content=_err("VALIDATION_ERROR", "edited_content is required for edit action"),
        )

    trace_id = doc.get("trace_id", str(uuid.uuid4()))
    recruiter_id = doc.get("recruiter_id", "")

    # Validate content requirements up-front, before any persistence.
    message_text: str | None = None
    if body.action == ApprovalAction.APPROVE:
        message_text = match_entry.get("outreach_draft") or ""
        if not message_text:
            return JSONResponse(
                status_code=409,
                content=_err(
                    "NO_DRAFT",
                    "Candidate has no outreach draft to approve "
                    "(may have been below the score threshold)",
                ),
            )
    elif body.action == ApprovalAction.EDIT:
        message_text = body.edited_content or ""

    # ------------------------------------------------------------------
    # Atomic approval: claim → send → finalize.
    #
    # The slot is a per-(task_id, member_id) lock in the approvals array.
    # Two rules enforced atomically by MongoDB:
    #
    #   R1. NO record for this member exists → push a new send_pending
    #       slot. Filter rejects concurrent peers that would also push.
    #   R2. A send_failed record exists     → atomically flip it to
    #       send_pending. This is the ONLY legal retry path; a fresh
    #       push is not allowed because the filter in R1 requires no
    #       prior record at all.
    #
    # Any other existing state (send_pending in-flight, completed,
    # rejected) causes both updates to match zero documents → 409.
    #
    # Each attempt carries an ``approval_id`` (uuid) so we locate the
    # right slot later without relying on timestamp uniqueness.
    # ------------------------------------------------------------------
    approval_id = str(uuid.uuid4())
    now = datetime.utcnow()
    target_state = "send_pending" if message_text is not None else "recorded"

    # --- R2 first: retake an existing send_failed slot if there is one. ---
    try:
        retry_res = traces.update_one(
            {
                "task_id": body.task_id,
                "approvals": {
                    "$elemMatch": {
                        "member_id": body.member_id,
                        "state": "send_failed",
                    }
                },
            },
            {"$set": {
                "approvals.$.approval_id": approval_id,
                "approvals.$.action": body.action.value,
                "approvals.$.edited_content": body.edited_content,
                "approvals.$.state": target_state,
                "approvals.$.sent": False,
                "approvals.$.message_id": None,
                "approvals.$.send_error": None,
                "approvals.$.decided_at": now,
                "approvals.$.finalized_at": None,
                "updated_at": now,
            }},
        )
    except Exception as exc:
        logger.error("MongoDB approval retry-claim failed: {}", exc)
        return JSONResponse(
            status_code=500,
            content=_err("DB_ERROR", "Failed to claim approval slot"),
        )

    claimed = retry_res.modified_count == 1

    # --- R1 fallback: push a fresh slot iff no record exists for member. ---
    if not claimed:
        pending_record: dict[str, Any] = {
            "approval_id": approval_id,
            "member_id": body.member_id,
            "action": body.action.value,
            "edited_content": body.edited_content,
            "state": target_state,
            "sent": False,
            "message_id": None,
            "send_error": None,
            "decided_at": now,
            "finalized_at": None,
        }
        try:
            push_res = traces.update_one(
                {
                    "task_id": body.task_id,
                    # Block on ANY existing record for this member — not
                    # just terminal ones — so a concurrent approve + an
                    # in-flight send_pending both cannot double-push.
                    "approvals": {
                        "$not": {
                            "$elemMatch": {"member_id": body.member_id}
                        }
                    },
                },
                {
                    "$push": {"approvals": pending_record},
                    "$set": {"updated_at": now},
                },
            )
        except Exception as exc:
            logger.error("MongoDB approval claim failed: {}", exc)
            return JSONResponse(
                status_code=500,
                content=_err("DB_ERROR", "Failed to claim approval slot"),
            )

        if push_res.modified_count == 0:
            # Something else holds the slot: in-flight pending, completed,
            # or rejected. Either way, no new action is allowed.
            return JSONResponse(
                status_code=409,
                content=_err(
                    "ALREADY_ACTIONED",
                    f"Candidate {body.member_id} already has an in-flight or "
                    f"terminal approval on task {body.task_id}",
                ),
            )

    # REJECT is terminal as soon as the slot is claimed — no send.
    if body.action == ApprovalAction.REJECT:
        try:
            traces.update_one(
                {
                    "task_id": body.task_id,
                    "approvals.approval_id": approval_id,
                },
                {"$set": {
                    "approvals.$.state": "rejected",
                    "approvals.$.finalized_at": datetime.utcnow(),
                }},
            )
        except Exception as exc:
            logger.error("MongoDB approval finalize (reject) failed: {}", exc)
        response = AIApproveResponse(actioned=True, message_id=None, sent=False)
        return JSONResponse(status_code=200, content=_ok(response.model_dump(), trace_id))

    # APPROVE or EDIT — attempt the send, then finalize the slot.
    sent = False
    message_id: str | None = None
    send_error: str | None = None
    try:
        result = await send_outreach_message(
            recruiter_id=recruiter_id,
            member_id=body.member_id,
            message_text=message_text or "",
        )
        sent = bool(result.get("sent", True))
        message_id = result.get("message_id")
    except Exception as exc:
        logger.error("send_outreach_message failed: {}", exc)
        send_error = str(exc)

    finalized_at = datetime.utcnow()
    final_state = "completed" if sent else "send_failed"
    try:
        traces.update_one(
            {
                "task_id": body.task_id,
                "approvals.approval_id": approval_id,
            },
            {"$set": {
                "approvals.$.state": final_state,
                "approvals.$.sent": sent,
                "approvals.$.message_id": message_id,
                "approvals.$.send_error": send_error,
                "approvals.$.finalized_at": finalized_at,
                "updated_at": finalized_at,
            }},
        )
    except Exception as exc:
        # Send already happened; we just failed to record it. Log loudly —
        # this is the narrow residual window where a subsequent retry
        # could cause a duplicate send (pending slot still looks in-flight
        # to future queries). Eliminating it entirely would need a
        # distributed-txn or 2PC with the Messaging Service, which is out
        # of scope for this project.
        logger.error(
            "CRITICAL: approval finalize write failed AFTER send "
            "(task={} member={} approval_id={} sent={} msg={}): {}",
            body.task_id, body.member_id, approval_id, sent, message_id, exc,
        )

    logger.info(
        "Task {} member {} actioned: {} state={} sent={} message_id={}",
        body.task_id, body.member_id, body.action.value,
        final_state, sent, message_id,
    )

    response = AIApproveResponse(actioned=True, message_id=message_id, sent=sent)
    status_code = 200 if not send_error else 502  # upstream messaging failure
    return JSONResponse(status_code=status_code, content=_ok(response.model_dump(), trace_id))


# ---------------------------------------------------------------------------
# WS /ai/stream/{task_id}
# ---------------------------------------------------------------------------


@app.websocket("/ai/stream/{task_id}")
async def ai_stream(websocket: WebSocket, task_id: str) -> None:
    """
    WebSocket endpoint — streams real-time progress for *task_id*.

    The supervisor broadcasts frames here as each step completes.
    On connect, the current task state is sent immediately as a catch-up frame.
    """
    await ws_manager.connect(task_id, websocket)
    try:
        # Send catch-up: current task state from MongoDB
        doc = get_ai_traces().find_one({"task_id": task_id}, {"_id": 0})
        if doc:
            current_status = doc.get("status", "pending")
            result = doc.get("result")
            # Map task-level status → UI status. Shortlist tasks that have a
            # result containing "shortlist" are presented as waiting_approval.
            if current_status == "completed" and isinstance(result, dict) and "shortlist" in result:
                ui_status = "waiting_approval"
            elif current_status in ("completed", "failed", "running", "pending"):
                ui_status = current_status
            else:
                ui_status = "running"

            catchup: dict[str, Any] = {
                "task_id": task_id,
                "trace_id": doc.get("trace_id", ""),
                "step": "catchup",
                "status": ui_status,
                "step_status": "",
                "message": "Reconnected — restoring task state",
                "progress": 100 if ui_status in ("completed", "waiting_approval") else 0,
                "partial_result": result,
                "timestamp": datetime.utcnow().isoformat() + "Z",
            }
            if ui_status == "failed":
                catchup["error"] = doc.get("error") or "Task failed"
                catchup["retryable"] = True
            await websocket.send_json(catchup)

        # Keep the connection alive until client disconnects
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                # Send a keepalive ping
                await websocket.send_json({"ping": True})
    except WebSocketDisconnect:
        ws_manager.disconnect(task_id, websocket)
    except Exception as exc:
        logger.warning("WebSocket error for task_id={}: {}", task_id, exc)
        ws_manager.disconnect(task_id, websocket)


# ---------------------------------------------------------------------------
# POST /ai/skills/parse-resume
# ---------------------------------------------------------------------------


@app.post("/ai/skills/parse-resume", tags=["Skills"])
async def skill_parse_resume(body: ParseResumeRequest) -> dict[str, Any]:
    """Parse a resume directly (bypasses Kafka workflow)."""
    from .skills.resume_parser import parse_resume

    trace_id = str(uuid.uuid4())
    try:
        result = await parse_resume(body.resume_text, body.member_id)
        return _ok(result.model_dump(), trace_id)
    except Exception as exc:
        logger.error("parse-resume skill error: {}", exc)
        return _err("SKILL_ERROR", str(exc), trace_id=trace_id)


# ---------------------------------------------------------------------------
# POST /ai/skills/match
# ---------------------------------------------------------------------------


@app.post("/ai/skills/match", tags=["Skills"])
async def skill_match(body: MatchRequest) -> dict[str, Any]:
    """Run job-candidate matching directly (bypasses Kafka workflow)."""
    from .skills.job_matcher import match_candidates

    trace_id = str(uuid.uuid4())
    try:
        result = await match_candidates(
            body.job_id,
            body.job_description,
            body.job_skills,
            body.candidate_profiles,
        )
        return _ok(result.model_dump(), trace_id)
    except Exception as exc:
        logger.error("match skill error: {}", exc)
        return _err("SKILL_ERROR", str(exc), trace_id=trace_id)


# ---------------------------------------------------------------------------
# POST /ai/coach
# ---------------------------------------------------------------------------


@app.post("/ai/coach", tags=["Skills"])
async def ai_coach(body: CoachRequest) -> dict[str, Any]:
    """
    Career Coach Agent — analyses a member profile against a target job and
    returns a structured skill-gap report (skills to add, headline rewrite,
    concrete resume improvements, and rationale).
    """
    from .skills.career_coach import generate_coaching

    trace_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())

    # Persist task document up front so the coach trace is queryable even
    # if the skill call fails.
    try:
        get_ai_traces().insert_one({
            "task_id": task_id,
            "trace_id": trace_id,
            "member_id": body.member_id,
            "target_job_id": body.target_job_id,
            "task_type": "coach",
            "status": TaskStatus.RUNNING.value,
            "steps": [],
            "result": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        })
    except Exception as exc:
        logger.error("MongoDB insert failed for ai/coach: {}", exc)

    try:
        response = await generate_coaching(
            body.member_id, body.target_job_id, trace_id
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("coach skill failed task={} trace={}: {}", task_id, trace_id, exc)
        try:
            get_ai_traces().update_one(
                {"task_id": task_id},
                {"$set": {
                    "status": TaskStatus.FAILED.value,
                    "updated_at": datetime.utcnow(),
                    "error": str(exc),
                }},
            )
        except Exception as db_exc:  # noqa: BLE001
            logger.error("MongoDB failure update also failed: {}", db_exc)
        return _err("SKILL_ERROR", str(exc), trace_id=trace_id)

    try:
        get_ai_traces().update_one(
            {"task_id": task_id},
            {"$set": {
                "status": TaskStatus.COMPLETED.value,
                "result": response.model_dump(),
                "updated_at": datetime.utcnow(),
            }},
        )
    except Exception as exc:
        logger.error("MongoDB update failed for ai/coach: {}", exc)

    return _ok(response.model_dump(), trace_id)
