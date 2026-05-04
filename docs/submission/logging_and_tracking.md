# Logging and Tracking Storage

## Runtime/service logs

In AWS, container runtime logs are stored in **CloudWatch Logs** through the ECS `awslogs` driver.

For the live `linkedinclone-prod3` backend stack, the main log groups are:

- `/ecs/linkedinclone-prod3/api-gateway`
- `/ecs/linkedinclone-prod3/profile`
- `/ecs/linkedinclone-prod3/job`
- `/ecs/linkedinclone-prod3/application`
- `/ecs/linkedinclone-prod3/messaging`
- `/ecs/linkedinclone-prod3/connection`
- `/ecs/linkedinclone-prod3/analytics`
- `/ecs/linkedinclone-prod3/ai-agent`
- `/ecs/linkedinclone-prod3/posts`
- `/ecs/linkedinclone-prod3/data-bootstrap`

The frontend ECS service also writes to CloudWatch Logs:

- `/ecs/linkedinclone/frontend`

These logs capture application errors, request handling issues, Kafka/outbox retries, AI task progress logs, and bootstrap/deployment diagnostics.

## Web/user/item tracking

User-behavior and item-tracking events are **not** stored in CloudWatch as the source of truth. They are stored in **MongoDB** so they can be queried for dashboards and reports.

Primary collections:

- `events`: normalized analytics events from `/events/ingest`
- `profile_views`: daily member profile-view tracking
- `ai_traces`: AI task status, steps, outputs, approvals, retry history
- `ai_outbox`: AI Kafka outbox for durable retry
- `processed_events`: idempotency ledger for AI/Kafka processing

## Why this split is effective

- **CloudWatch Logs** is best for operational debugging, ECS task failures, and deployment/runtime observability.
- **MongoDB event collections** are best for recruiter/member dashboards, funnel analysis, geo analysis, saved-job trends, and AI evaluation metrics.
- **MySQL** remains the transactional store for profiles, jobs, applications, recruiter updates, and connection/message metadata that require relational consistency.

## Tracking examples implemented

- `job.viewed`
- `job.saved`
- `application.submitted`
- `message.sent`
- `connection.requested`
- AI workflow request/result events on `ai.requests` and `ai.results`

All event messages follow the shared Kafka-style envelope with:

- `event_type`
- `trace_id`
- `timestamp`
- `actor_id`
- `entity`
- `payload`
- `idempotency_key`
