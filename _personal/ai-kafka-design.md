# AI Agent Service — Kafka Topic Design

**Author:** Bhoomika (Member 3)
**Last updated:** 2026-04-16

---

## Topics Overview

| Topic | Producer | Consumer | Partitions | Retention |
|-------|----------|----------|-----------|-----------|
| `ai.requests` | AI Agent REST `/ai/request` | Hiring Assistant Supervisor (group: `ai-supervisor-group`) | 3 | 7 days |
| `ai.results` | Hiring Assistant Supervisor | AI Agent WebSocket broadcaster + Frontend (group: `ai-results-group`) | 3 | 7 days |
| `ai.requests.dlq` | Consumer after 3 failures | Ops / alerting | 1 | 30 days |
| `ai.results.dlq` | Producer after 3 failures | Ops / alerting | 1 | 30 days |

---

## Standard Event Envelope

All messages on every topic use this exact JSON shape (frozen contract):

```json
{
  "event_type": "ai.requested | ai.progress | ai.completed | ai.failed",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-04-15T10:30:00.000Z",
  "actor_id": "recruiter-id-or-ai-supervisor",
  "entity": {
    "entity_type": "ai_task",
    "entity_id": "task-uuid"
  },
  "payload": { ... },
  "idempotency_key": "unique-uuid-per-message"
}
```

**Event type rules (per topic):**

| Topic | Allowed `event_type` values |
|-------|------------------------------|
| `ai.requests` | `ai.requested` (only) |
| `ai.results`  | `ai.progress` (intermediate), `ai.completed` (final success), `ai.failed` (final failure) |

`ai.requested` is **never** emitted on the results topic.

---

## Topic: `ai.requests`

**Purpose:** Triggers the Hiring Assistant Supervisor to start a workflow.

### Sample Payload — Shortlist task

```json
{
  "event_type": "ai.requested",
  "trace_id": "abc123",
  "timestamp": "2025-04-15T10:30:00.000Z",
  "actor_id": "recruiter-001",
  "entity": {
    "entity_type": "ai_task",
    "entity_id": "task-001"
  },
  "payload": {
    "task_id": "task-001",
    "job_id": "job-abc",
    "recruiter_id": "recruiter-001",
    "task_type": "shortlist"
  },
  "idempotency_key": "idem-xyz"
}
```

**Supported `task_type` values:**

| Value | Description |
|-------|-------------|
| `shortlist` | Full pipeline: fetch apps → parse resumes → match → draft outreach |
| `match` | Shortlisting without outreach drafts |
| `parse` | Parse a single resume (resume_text in payload) |
| `coach` | Career coach for a member (Phase 2) |

---

## Topic: `ai.results`

**Purpose:** Supervisor emits one message per step (intermediate progress) and one
final message when the workflow completes. Frontend WebSocket clients receive these
in real-time.

### Sample Payload — Intermediate progress (step: parsing_resumes)

```json
{
  "event_type": "ai.progress",
  "trace_id": "abc123",
  "timestamp": "2025-04-15T10:30:05.000Z",
  "actor_id": "ai-supervisor",
  "entity": {
    "entity_type": "ai_task",
    "entity_id": "task-001"
  },
  "payload": {
    "task_id": "task-001",
    "step": "parsing_resumes",
    "step_status": "completed",
    "partial_result": {
      "resumes_parsed": 5
    }
  },
  "idempotency_key": "idem-progress-parse"
}
```

### Sample Payload — Final result

```json
{
  "event_type": "ai.completed",
  "trace_id": "abc123",
  "timestamp": "2025-04-15T10:30:45.000Z",
  "actor_id": "ai-supervisor",
  "entity": {
    "entity_type": "ai_task",
    "entity_id": "task-001"
  },
  "payload": {
    "task_id": "task-001",
    "step": "complete",
    "step_status": "completed",
    "partial_result": {
      "shortlist": [
        {
          "member_id": "member-001",
          "score": 0.82,
          "skill_overlap": 0.75,
          "embedding_similarity": 0.93,
          "rationale": "Skill overlap 75% (matched: python, kafka, mongodb); semantic similarity 93%.",
          "outreach_draft": "Hi Alice, I came across your profile..."
        }
      ],
      "metrics": {
        "candidates_evaluated": 5,
        "top_score": 0.82,
        "avg_score": 0.61
      }
    }
  },
  "idempotency_key": "idem-final"
}
```

---

## Idempotency Design

1. Every Kafka message includes a unique `idempotency_key` (UUID v4).
2. Before processing an `ai.requests` message, the supervisor queries MongoDB for
   `{idempotency_key: <key>}` in `ai_traces`.
3. If a document exists **and** its `status` is `running` or `completed`, the message
   is skipped (offset still committed to avoid reprocessing).
4. This handles:
   - Consumer crash-restart (at-least-once delivery)
   - Duplicate `ai.requests` publishes from the REST layer

---

## Consumer Group: `ai-supervisor-group`

- **Partition assignment:** 3 partitions → 3 potential parallel consumers
- **Offset commit strategy:** Manual, committed **after** successful MongoDB write
- **Dead-letter queue:** After 3 processing failures, message routed to `ai.requests.dlq`
- **Rebalance handling:** Uses `enable.auto.commit=false` + explicit `consumer.commit()`

---

## Failure Handling

| Failure | Behaviour |
|---------|-----------|
| Kafka produce timeout | Retry 3× with exponential backoff (2s, 4s, 8s) |
| All retries exhausted | Log error; task marked `failed` in MongoDB; WS clients notified |
| Consumer crash | On restart, re-reads uncommitted offset; idempotency prevents duplicate processing |
| Skill timeout (>30s) | Step marked `failed`; supervisor continues with partial results |
| Dead-letter | After 3 consumer failures → route to `*.dlq` for manual inspection |
