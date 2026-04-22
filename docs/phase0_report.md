# Phase 0 — Repository Assessment & Local Setup Report

**Date:** 2026-04-22
**Author:** Parth Patel (Member 7)

---

## 0.1 — Clone and Inventory

### Directory Tree (2 levels)

```
linkedin-project/
├── .env.example
├── .gitignore
├── .github/
│   └── workflows/ci.yml
├── README.md
├── package.json
├── docker-compose.yml              # root wrapper (includes infra/)
├── data/
│   ├── schema.sql                  # MySQL DDL — 16 tables
│   └── mongo_setup.js              # MongoDB collections + indexes
├── docs/
│   ├── LinkedInClone.postman_collection.json   # canonical Postman
│   ├── api/                        # member-level API drafts
│   └── submission/                 # final API doc + architecture diagram
├── infra/
│   └── docker-compose.yml          # MySQL, MongoDB, Redis, Zookeeper, Kafka
├── services/
│   ├── profile/    (Node.js/Express)
│   ├── job/        (Node.js/Express)
│   ├── application/(Node.js/Express)
│   ├── messaging/  (Node.js/Express)
│   ├── connection/ (Node.js/Express)
│   ├── analytics/  (Node.js/Express)
│   ├── ai-agent/   (Python/FastAPI)
│   └── shared/     (empty placeholder)
├── tests/
│   └── submission_contract_check.sh
└── progress.md
```

### Service Inventory

| Service | Language / Framework | Package File | Dependencies Installed |
|---------|---------------------|-------------|----------------------|
| profile | Node.js / Express | `package.json` | Yes (express, mysql2, dotenv) |
| job | Node.js / Express | `package.json` | Yes (express) |
| application | Node.js / Express | `package.json` | Yes (express) |
| messaging | Node.js / Express | `package.json` | Yes (express) |
| connection | Node.js / Express | `package.json` | Yes (express) |
| analytics | Node.js / Express | `package.json` | Yes (express) |
| ai-agent | Python 3 / FastAPI | `requirements.txt` | Yes (.venv) |

### Infrastructure (docker-compose)

| Service | Image | Port | Healthcheck |
|---------|-------|------|-------------|
| MySQL | mysql:8.0 | 3307→3306 | `mysqladmin ping` |
| MongoDB | mongo:7 | 27017 | `mongosh --eval ping` |
| Redis | redis:7-alpine | 6379 | `redis-cli ping` |
| Zookeeper | confluentinc/cp-zookeeper:7.6.1 | 2181 | `srvr` 4lw command |
| Kafka | confluentinc/cp-kafka:7.6.1 | 9092 | `kafka-broker-api-versions` |

### Environment Variables (.env.example)

```
DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME
MONGO_URI
REDIS_HOST, REDIS_PORT
KAFKA_BROKERS
OPENAI_API_KEY (for AI agent)
```

### Existing Tests

| Path | Type | Description |
|------|------|-------------|
| `tests/submission_contract_check.sh` | Shell | Validates API doc structure (ripgrep/grep) |
| `.github/workflows/ci.yml` | CI | Runs contract check + Postman JSON validation |

No unit tests (`*.test.js`, `test_*.py`) or integration tests exist yet.

---

## 0.2 — Local Environment Bootstrap

### Infrastructure Status

All 5 containers start and reach `healthy`:

| Container | Status | Ports |
|-----------|--------|-------|
| linkedinclone-mysql | healthy | 0.0.0.0:3307→3306 |
| linkedinclone-mongodb | healthy | 0.0.0.0:27017→27017 |
| linkedinclone-redis | healthy | 0.0.0.0:6379→6379 |
| linkedinclone-zookeeper | healthy | 0.0.0.0:2181→2181 |
| linkedinclone-kafka | healthy | 0.0.0.0:9092→9092 |

### Database Initialization

**MySQL** — schema.sql loaded on first boot. 16 tables confirmed:

`members`, `recruiters`, `jobs`, `job_skills`, `applications`, `application_notes`,
`connections`, `threads`, `thread_participants`, `messages`, `member_skills`,
`member_experience`, `member_education`, `processed_events`, `outbox_events`

**MongoDB** — mongo_setup.js loaded. 4 collections confirmed:

`ai_traces`, `profile_views`, `events`, `resumes`

### Service Startup Status

| Service | Port | Starts? | GET /health | DB | Kafka | Notes |
|---------|------|---------|-------------|-----|-------|-------|
| Profile | 8001 | OK | 200 | connected | disconnected | Fully implemented (5 endpoints) |
| Job | 8002 | OK | 200 | disconnected | disconnected | Stub only (501 catch-all) |
| Application | 8003 | OK | 200 | disconnected | disconnected | Stub only (501 catch-all) |
| Messaging | 8004 | OK | 200 | disconnected | disconnected | Stub only (501 catch-all) |
| Connection | 8005 | OK | 200 | disconnected | disconnected | Stub only (501 catch-all) |
| Analytics | 8006 | OK | 200 | disconnected | disconnected | Stub only (501 catch-all) |
| AI Agent | 8007 | OK | 200 | connected | connected | Fully implemented (4 + WS + extra skills) |

**Result:** All 7 services start successfully. All 7 return valid `/health` JSON.

---

## 0.3 — Integration Gap Analysis

### Legend

- **Implemented** — Route exists, has business logic, talks to DB, returns correct envelopes
- **Stub** — Route does not exist; falls through to 501 NOT_IMPLEMENTED catch-all
- **Missing** — Endpoint not even registered (same effect as Stub for these services)

### Profile Service (:8001) — Member 1 owns

| Endpoint | Contract | Status | Notes |
|----------|----------|--------|-------|
| `GET /health` | §3 | **Implemented** | Reports db: connected/disconnected dynamically |
| `POST /members/create` | §4.1 | **Implemented** | 201 + full profile; 409 DUPLICATE_EMAIL; 400 VALIDATION_ERROR |
| `POST /members/get` | §4.1 | **Implemented** | 200 + nested skills/experience/education; 404 MEMBER_NOT_FOUND |
| `POST /members/update` | §4.1 | **Implemented** | 200 + updated profile; replaces skills/exp/edu arrays in txn |
| `POST /members/delete` | §4.1 | **Implemented** | 200 {deleted:true}; cascades dependents in txn |
| `POST /members/search` | §4.1 | **Implemented** | Keyword (fulltext), skill, location filters + pagination |
| Response envelope | §2 | **Implemented** | {success, data/error, trace_id} on all routes |
| Kafka producer | §5 | **Missing** | No events produced yet |
| CORS | — | **Missing** | No CORS middleware |
| Shared utility | — | **Missing** | Envelope helpers are inline, not in /services/shared/ |

### Job Service (:8002) — Member 1 owns

| Endpoint | Contract | Status | Notes |
|----------|----------|--------|-------|
| `GET /health` | §3 | **Implemented** | Static response (db/kafka always disconnected) |
| `POST /jobs/create` | §4.2 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /jobs/get` | §4.2 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /jobs/update` | §4.2 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /jobs/search` | §4.2 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /jobs/close` | §4.2 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /jobs/byRecruiter` | §4.2 | **Stub** | 501 NOT_IMPLEMENTED |
| Response envelope | §2 | **Partial** | 501 uses envelope shape but trace_id is hardcoded "pending" |
| Kafka producer (`job.viewed`) | §5 | **Missing** | |
| DB connection (MySQL) | — | **Missing** | No db.js or pool |
| CORS | — | **Missing** | |

### Application Service (:8003) — Member 1 owns

| Endpoint | Contract | Status | Notes |
|----------|----------|--------|-------|
| `GET /health` | §3 | **Implemented** | Static response |
| `POST /applications/submit` | §4.3 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /applications/get` | §4.3 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /applications/byJob` | §4.3 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /applications/byMember` | §4.3 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /applications/updateStatus` | §4.3 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /applications/addNote` | §4.3 | **Stub** | 501 NOT_IMPLEMENTED |
| Response envelope | §2 | **Partial** | Same as Job |
| Kafka producer (`application.submitted`) | §5 | **Missing** | |
| DB connection (MySQL) | — | **Missing** | |
| CORS | — | **Missing** | |

### Messaging Service (:8004) — Member 4 owns

| Endpoint | Contract | Status | Notes |
|----------|----------|--------|-------|
| `GET /health` | §3 | **Implemented** | Static response |
| `POST /threads/open` | §4.4 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /threads/get` | §4.4 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /threads/byUser` | §4.4 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /messages/list` | §4.4 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /messages/send` | §4.4 | **Stub** | 501 NOT_IMPLEMENTED |
| Kafka producer (`message.sent`) | §5 | **Missing** | |
| DB connection (MySQL) | — | **Missing** | |
| CORS | — | **Missing** | |

### Connection Service (:8005) — Member 4 owns

| Endpoint | Contract | Status | Notes |
|----------|----------|--------|-------|
| `GET /health` | §3 | **Implemented** | Static response |
| `POST /connections/request` | §4.5 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /connections/accept` | §4.5 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /connections/reject` | §4.5 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /connections/list` | §4.5 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /connections/mutual` | §4.5 | **Stub** | 501 NOT_IMPLEMENTED (extra credit) |
| Kafka producer (`connection.requested`, `connection.accepted`) | §5 | **Missing** | |
| DB connection (MySQL) | — | **Missing** | |
| CORS | — | **Missing** | |

### Analytics/Events Service (:8006) — Member 5 owns

| Endpoint | Contract | Status | Notes |
|----------|----------|--------|-------|
| `GET /health` | §3 | **Implemented** | Static response |
| `POST /events/ingest` | §4.6 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /analytics/jobs/top` | §4.6 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /analytics/funnel` | §4.6 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /analytics/geo` | §4.6 | **Stub** | 501 NOT_IMPLEMENTED |
| `POST /analytics/member/dashboard` | §4.6 | **Stub** | 501 NOT_IMPLEMENTED |
| DB connection (MongoDB) | — | **Missing** | |
| Redis cache | — | **Missing** | |
| CORS | — | **Missing** | |

### AI Agent Service (:8007) — Member 3 owns

| Endpoint | Contract | Status | Notes |
|----------|----------|--------|-------|
| `GET /health` | §3 | **Implemented** | Dynamic db + kafka status |
| `POST /ai/request` | §4.7 | **Implemented** | 202 + task_id + trace_id; persists to MongoDB; publishes to ai.requests |
| `POST /ai/status` | §4.7 | **Implemented** | 200 + status/steps/result from MongoDB |
| `POST /ai/approve` | §4.7 | **Implemented** | 200 + {actioned:true}; handles approve/edit/reject with outreach |
| `WS /ai/stream/{task_id}` | §4.7 | **Implemented** | Catchup frame + live broadcast via Kafka results consumer |
| `POST /ai/skills/parse-resume` | Extra | **Implemented** | Direct skill (bypasses Kafka) |
| `POST /ai/skills/match` | Extra | **Implemented** | Direct skill (bypasses Kafka) |
| `POST /ai/coach` | Extra | **Implemented** | Career coaching with MongoDB trace |
| Response envelope | §2 | **Implemented** | {success, data/error, trace_id} |
| Kafka producer | §5 | **Implemented** | Produces to ai.requests; outbox poller for retries |
| Kafka consumer | §5 | **Implemented** | Consumes ai.requests + ai.results |
| CORS | — | **Implemented** | CORSMiddleware configured |

### Cross-Cutting Concerns

| Concern | Status | Details |
|---------|--------|---------|
| Response envelopes (§2) | **Partial** | Profile + AI Agent use correct shape. Other 5 services have stubs with hardcoded trace_id. |
| Health contract (§3) | **Done** | All 7 services return `{status, service, db, kafka}`. |
| Port map (§4) | **Done** | 8001–8007 all correctly assigned. |
| Kafka topics created | **Not verified** | Topics may auto-create on first produce; no explicit setup script. |
| Kafka envelope (§5.2) | **Partial** | AI Agent follows envelope. No other service produces events yet. |
| Failure modes (§6) | **Partial** | Profile handles DUPLICATE_EMAIL, MEMBER_NOT_FOUND, VALIDATION_ERROR. Others not implemented. |
| Shared /services/shared/ utility | **Empty** | No shared code extracted yet. |
| CORS on Node services | **Missing** | Only AI Agent has CORS. |
| Seed data loader | **Missing** | No script to populate test records. |
| Unit/integration tests | **Missing** | No test files exist (only submission_contract_check.sh). |
| Frontend | **Missing** | No React frontend in repo. Member 2's responsibility. |

### Summary Counts

| | Implemented | Stub/Missing | Total |
|---|---:|---:|---:|
| Profile Service endpoints | 5/5 | 0 | 5 |
| Job Service endpoints | 0/6 | 6 | 6 |
| Application Service endpoints | 0/6 | 6 | 6 |
| Messaging Service endpoints | 0/5 | 5 | 5 |
| Connection Service endpoints | 0/5 | 5 | 5 |
| Analytics Service endpoints | 0/5 | 5 | 5 |
| AI Agent Service endpoints | 4/4 + WS + 3 extra | 0 | 7+ |
| Health endpoints | 7/7 | 0 | 7 |
| **Total business endpoints** | **9 of 36** | **27** | **36** |

### Priority Action Items for Member 7 (Parth)

1. **Job Service** — Implement all 6 endpoints with MySQL (same pattern as Profile)
2. **Application Service** — Implement all 6 endpoints with MySQL
3. **Shared utility** — Extract `successResponse()`, `errorResponse()`, `generateTraceId()` into `/services/shared/`
4. **CORS** — Add `cors` middleware to all Node services
5. **Kafka producers** — Wire job.viewed + application.submitted events
6. **Seed data loader** — Script to insert 100+ test records per table
