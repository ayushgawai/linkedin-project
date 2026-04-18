"""Centralized Kafka event envelope builders.

Every Kafka message this service produces must go through one of these
builders so that envelope shape, event-type rules, and idempotency-key
conventions stay consistent across all code paths.
"""
from __future__ import annotations

from typing import Any

from .models import KafkaEntity, KafkaEventEnvelope

AI_SUPERVISOR_ACTOR = "ai-supervisor"


def build_request_envelope(
    *,
    task_id: str,
    trace_id: str,
    actor_id: str,
    payload: dict[str, Any],
    idempotency_key: str | None = None,
) -> KafkaEventEnvelope:
    """
    Build an envelope for the ``ai.requests`` topic.

    Only ``ai.requested`` is valid on this topic.
    """
    return KafkaEventEnvelope(
        event_type="ai.requested",
        trace_id=trace_id,
        actor_id=actor_id,
        entity=KafkaEntity(entity_type="ai_task", entity_id=task_id),
        payload=payload,
        idempotency_key=idempotency_key or f"ai-task-{task_id}",
    )


def build_result_envelope(
    *,
    task_id: str,
    trace_id: str,
    step: str,
    step_status: str,
    terminal: str | None = None,
    partial_result: dict[str, Any] | None = None,
    actor_id: str = AI_SUPERVISOR_ACTOR,
) -> KafkaEventEnvelope:
    """
    Build an envelope for the ``ai.results`` topic.

    ``terminal`` selects the final event type:
      - ``"completed"`` → ``ai.completed``
      - ``"failed"``    → ``ai.failed``
      - ``None``        → ``ai.progress`` (intermediate)

    ``ai.requested`` is **never** valid on this topic.
    """
    if terminal == "completed":
        event_type = "ai.completed"
    elif terminal == "failed":
        event_type = "ai.failed"
    else:
        event_type = "ai.progress"

    return KafkaEventEnvelope(
        event_type=event_type,
        trace_id=trace_id,
        actor_id=actor_id,
        entity=KafkaEntity(entity_type="ai_task", entity_id=task_id),
        payload={
            "task_id": task_id,
            "step": step,
            "step_status": step_status,
            "partial_result": partial_result,
        },
        # Deterministic idempotency key — the same (task, step, status)
        # from the same trace must produce the same key across replicas
        # so downstream consumers can dedupe duplicate deliveries of the
        # same logical event. Includes trace_id so that an accidental
        # replay of an older run for the same task does not collide with
        # an in-flight run.
        idempotency_key=f"{trace_id}:{task_id}:{step}:{step_status}",
    )
