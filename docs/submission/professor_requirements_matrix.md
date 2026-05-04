# Professor Requirements Matrix

This file maps the professor's project requirements to the current implementation state in the repo and AWS deployment.

## Fully implemented in code/infrastructure

- **Distributed services on AWS/ECS with Docker**
  - `infra/aws/full-platform.yaml`
  - `infra/aws/frontend-ecs.yaml`
  - Separate backend/frontend stacks reduce blast radius for redeploys.

- **Kafka-based architecture**
  - Domain topics and shared event envelope implemented across services.
  - AI orchestration uses `ai.requests` and `ai.results`.

- **MySQL + MongoDB split**
  - MySQL: members, recruiters, jobs, applications, message/thread metadata, connections metadata.
  - MongoDB: analytics `events`, `profile_views`, AI traces/outbox, connection graph mirror/supporting documents.

- **Seed pipeline with required scale**
  - Automated bootstrap pipeline from Kaggle/S3 into DB.
  - Seed targets include 10,000 members, 10,000 recruiters, 10,000 jobs, and realistic application/event volume.

- **Redis SQL caching**
  - Shared cache layer plus benchmark artifacts in `docs/perf-results.json` and `docs/performance-summary.md`.

- **Analytics and tracking**
  - `/events/ingest`
  - `/analytics/jobs/top`
  - `/analytics/funnel`
  - `/analytics/geo`
  - `/analytics/member/dashboard`

- **FastAPI Agentic AI service**
  - `services/ai-agent/src/main.py`
  - REST request/status/approve endpoints
  - WebSocket streaming
  - Kafka-backed supervisor workflow
  - Human-in-the-loop approval
  - Persisted traces and idempotency handling

- **CI**
  - `.github/workflows/ci.yml`
  - API contract checks
  - backend tests
  - frontend build
  - Docker image build smoke for all service images

- **Runtime logging**
  - ECS services log to CloudWatch Logs through `awslogs`.
  - Tracking/event analytics stored in MongoDB collections for dashboards.

## Implemented, but depends on deployment being updated

- **AI service running against real downstream services on AWS**
  - The updated CloudFormation template now explicitly sets:
    - `PROFILE_SERVICE_URL`
    - `JOB_SERVICE_URL`
    - `APPLICATION_SERVICE_URL`
    - `MESSAGING_SERVICE_URL`
    - `USE_MOCK_SERVICES=false`
  - This must be deployed to AWS so the running ECS AI task stops using fallback mock mode.

## Submission artifacts that still require team/manual assembly

- Title page with member list
- Contributions page
- Final 5-page write-up
- Final presentation slides
- Final selected screenshots for UI/schema/demo

## Notes for demo/presentation

- Use the public HTTPS frontend URL, not the old raw frontend ELB hostname.
- Show both:
  - CloudWatch logs for operational logging
  - MongoDB-backed dashboards/events for web/user/item tracking
- For AI demo, show:
  - task request
  - live progress/status
  - shortlist result
  - approval/edit/reject
  - resulting recruiter-facing action
