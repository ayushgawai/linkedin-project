# LinkedIn Clone — Architecture Diagrams
> All diagrams generated from actual source code. Last updated May 2025.

---

## Diagram 1 — Full System Architecture

```mermaid
graph TB
    subgraph Client["Client Layer"]
        FE["React 18 + TypeScript\nPort 3000 (Manav)"]
    end

    subgraph ALB_Layer["AWS Application Load Balancer"]
        ALB["ALB — HTTPS termination\nECS Fargate target groups"]
    end

    subgraph Services["Microservices Layer (ECS Fargate)"]
        P["Profile Service\nNode.js · Port 8001\n(Ayush)"]
        J["Job Service\nNode.js · Port 8002\n(Ayush)"]
        A["Application Service\nNode.js · Port 8003\n(Ayush)"]
        M["Messaging Service\nFastAPI · Port 8004\n(Khushi)"]
        C["Connection Service\nFastAPI · Port 8005\n(Khushi)"]
        AN["Analytics Service\nNode.js · Port 8006\n(Naman & Centhur)"]
        AI["AI Agent Service\nFastAPI · Port 8007\n(Bhoomika)"]
    end

    subgraph Kafka["Event Bus — Apache Kafka (Confluent 7.6.1)"]
        K["11 Topics · 2 DLQs\nRetention: 7 days"]
    end

    subgraph Persistence["Persistence Layer"]
        MYSQL["MySQL 8.4 (InnoDB)\n17 tables · RDS on AWS\nFULLTEXT + UUID PKs"]
        MONGO["MongoDB 7\n4 collections\nTTL indexes (90 days)"]
        REDIS["Redis 7\nCache-aside · REDIS_ENABLED flag\nSCAN+UNLINK invalidation"]
        S3["S3 / MinIO\nResume PDFs\nProfile photos"]
    end

    subgraph Observability["Observability (AWS)"]
        CW["CloudWatch Logs\nawslogs driver\nPer-service log groups"]
        ECR["ECR\n3 container repos"]
    end

    FE -->|HTTP REST / WebSocket| ALB
    ALB --> P & J & A & M & C & AN & AI

    P -->|reads/writes| MYSQL
    P -->|uploads| S3
    J -->|reads/writes| MYSQL
    A -->|reads/writes| MYSQL
    A -->|uploads resumes| S3
    M -->|reads/writes| MYSQL
    C -->|reads/writes| MYSQL
    C -->|mirrors accepted edges| MONGO
    AN -->|reads/writes| MONGO
    AN -->|cache-aside| REDIS
    AI -->|traces + resumes| MONGO

    A -->|publishOrOutbox| K
    J -->|publishOrOutbox| K
    M -->|publishOrOutbox| K
    C -->|produce| K
    AI -->|produce ai.results| K

    K -->|consumes| AN
    K -->|consumes ai.requests| AI
    K -->|messaging-consumer-group| M

    P & J & A & M -->|awslogs| CW
    ECR -.->|image pull| ALB
```

---

## Diagram 2 — Kafka Event Flow

```mermaid
flowchart LR
    subgraph Producers
        JS["Job Service"]
        AS["Application Service"]
        MS["Messaging Service"]
        CS["Connection Service"]
        ANY["Any Service"]
        AIS["AI Agent"]
    end

    subgraph Topics["Kafka Topics"]
        T1["job.viewed\n3 partitions"]
        T2["job.saved\n3 partitions"]
        T3["application.submitted\n6 partitions"]
        T4["application.status.updated\n3 partitions"]
        T5["message.sent\n6 partitions"]
        T6["connection.requested\n3 partitions"]
        T7["connection.accepted\n3 partitions"]
        T8["ai.requests\n3 partitions"]
        T9["ai.results\n3 partitions"]
        DLQ1["application.submitted.dlq\n1 partition"]
        DLQ2["message.sent.dlq\n1 partition"]
    end

    subgraph ConsumerGroups["Consumer Groups"]
        CG1["analytics-consumer-group\n(Analytics Service)"]
        CG2["messaging-consumer-group\n(Messaging Service)"]
        CG3["connection-consumer-group\n(Connection Service)"]
        CG4["ai-supervisor-group\n(AI Agent)"]
        CG5["ai-results-group\n(AI Agent)"]
        CG6["application-analytics-group\n(Bridge Consumer in Connection Svc)"]
    end

    subgraph Sinks
        ANS["Analytics Service\nMongoDB events"]
        WS["WebSocket clients"]
        OPS["Ops / alerting"]
    end

    JS --> T1 & T2
    AS --> T3 & T4
    MS --> T5
    CS --> T6 & T7
    ANY --> T8
    AIS --> T9

    T1 & T2 & T3 & T4 & T6 & T7 & T5 --> CG1
    T5 --> CG2
    T6 & T7 --> CG3
    T8 --> CG4
    T9 --> CG5

    T3 --> CG6
    CG6 -->|POST /events/ingest| ANS

    CG1 --> ANS
    CG5 --> WS
    CG2 -->|3 retries then| DLQ2
    AS -->|3 retries then| DLQ1
    DLQ1 & DLQ2 --> OPS
```

---

## Diagram 3 — AI Agent Workflow

```mermaid
sequenceDiagram
    participant Client as Recruiter (Browser)
    participant API as AI Agent API :8007
    participant SUP as HiringAssistantSupervisor
    participant KIN as ai.requests consumer
    participant PS as Profile Service :8001
    participant JS as Job Service :8002
    participant AppS as Application Service :8003
    participant Skills as Skills (Parser / Matcher)
    participant MONGO as MongoDB (ai_traces)
    participant KOUT as ai.results producer
    participant WS as WebSocket (ws_manager)

    alt REST path
        Client->>API: POST /ai/request {job_id, ...}
        API->>SUP: process_task(payload)
    else Kafka path
        KIN->>KIN: poll ai.requests
        KIN->>SUP: process_task(payload)
    end

    SUP->>MONGO: claim_idempotency_key (dedup)
    SUP->>JS: get_job(job_id) [HTTP or mock]
    SUP->>AppS: get_applications_by_job(job_id) [HTTP or mock]
    loop For each applicant
        SUP->>PS: get_member_profile(member_id) [HTTP or mock]
        SUP->>Skills: parse_resume(resume_text)
        Note right of Skills: 60+ skill dict<br/>+ optional OpenAI fallback
    end
    SUP->>Skills: match_candidates(job, candidates)
    Note right of Skills: Jaccard (0.6) +<br/>sentence-transformers (0.4)
    SUP->>Skills: draft_outreach(top_N candidates)
    SUP->>MONGO: persist step progress (ai_traces)
    SUP->>KOUT: produce ai.results envelope

    KOUT->>WS: broadcast progress to WebSocket
    WS->>Client: live progress stream

    alt Score above threshold → needs approval
        WS->>Client: pending_approval notification
        Client->>API: POST /ai/approve {task_id, action}
        API->>SUP: unblock task graph branch
    end

    SUP->>MONGO: finalize_idempotency_key (COMPLETED)
    SUP->>KOUT: produce final result
    KOUT->>WS: final shortlist broadcast
    WS->>Client: shortlist result
```

---

## Diagram 4 — Request Flow (Frontend → DB → Response)

```mermaid
flowchart TD
    USER["Browser / React App"]
    ALB["AWS ALB"]

    subgraph SVC["Microservice (example: Job Service :8002)"]
        ROUTE["Express Route Handler"]
        AUTH["JWT Validation"]
        CACHE_R["Redis getOrSet\ncache.js"]
        DB_R["MySQL Query\n(knex)"]
        DB_W["MySQL Write\n(knex + transaction)"]
        CACHE_I["Redis invalidate(key)\nor invalidatePrefix(prefix)"]
        OUTBOX["publishOrOutbox()\noutbox.js"]
    end

    subgraph Async["Async / Background"]
        KAFKA["Kafka Broker"]
        POLLER["Outbox Poller\n10s interval"]
        OUTBOX_TBL["outbox_events table"]
    end

    CONSUMER["Downstream Consumer\n(Analytics / AI Agent)"]

    USER -->|HTTPS request| ALB
    ALB --> ROUTE
    ROUTE --> AUTH

    AUTH -->|GET request| CACHE_R
    CACHE_R -->|HIT| USER
    CACHE_R -->|MISS| DB_R
    DB_R -->|store + return| CACHE_R

    AUTH -->|POST/PUT/DELETE| DB_W
    DB_W -->|success| CACHE_I
    CACHE_I --> OUTBOX

    OUTBOX -->|broker UP| KAFKA
    OUTBOX -->|broker DOWN, same TX| OUTBOX_TBL
    OUTBOX_TBL -->|broker recovers| POLLER
    POLLER --> KAFKA

    KAFKA --> CONSUMER
    DB_W -->|HTTP response| USER
```

---

## Diagram 5 — Database Schema Relationships

```mermaid
erDiagram
    members {
        VARCHAR36 member_id PK
        VARCHAR first_name
        VARCHAR last_name
        TEXT headline
        TEXT about
        VARCHAR avatar_url
        FULLTEXT idx_ft
    }
    recruiters {
        VARCHAR36 recruiter_id PK
        VARCHAR name
        VARCHAR company
        VARCHAR email
    }
    jobs {
        VARCHAR36 job_id PK
        VARCHAR36 recruiter_id FK
        VARCHAR title
        TEXT description
        VARCHAR location
        BOOLEAN is_open
        FULLTEXT idx_ft
    }
    job_skills {
        VARCHAR36 job_id FK
        VARCHAR skill
    }
    applications {
        VARCHAR36 application_id PK
        VARCHAR36 job_id FK
        VARCHAR36 member_id FK
        VARCHAR resume_url
        TEXT resume_text
        ENUM status
        UNIQUE uk_job_member
    }
    application_notes {
        VARCHAR36 note_id PK
        VARCHAR36 application_id FK
        VARCHAR36 recruiter_id
        TEXT note_text
    }
    connections {
        VARCHAR36 connection_id PK
        VARCHAR36 user_a
        VARCHAR36 user_b
        ENUM status
        VARCHAR36 requested_by
        UNIQUE uk_pair
    }
    threads {
        VARCHAR36 thread_id PK
        TIMESTAMP created_at
    }
    thread_participants {
        VARCHAR36 thread_id FK
        VARCHAR36 user_id
    }
    messages {
        VARCHAR36 message_id PK
        VARCHAR36 thread_id FK
        VARCHAR36 sender_id
        TEXT body
    }
    member_skills {
        VARCHAR36 member_id FK
        VARCHAR skill
    }
    member_experience {
        VARCHAR36 exp_id PK
        VARCHAR36 member_id FK
        VARCHAR title
        VARCHAR company
    }
    member_education {
        VARCHAR36 edu_id PK
        VARCHAR36 member_id FK
        VARCHAR institution
        VARCHAR degree
    }
    outbox_events {
        BIGINT id PK
        VARCHAR topic
        TEXT payload
        TINYINT sent
        TIMESTAMP created_at
    }
    processed_events {
        VARCHAR255 idempotency_key PK
        TIMESTAMP created_at
    }

    recruiters ||--o{ jobs : "posts"
    jobs ||--o{ job_skills : "requires"
    jobs ||--o{ applications : "receives"
    members ||--o{ applications : "submits"
    applications ||--o{ application_notes : "has"
    threads ||--o{ thread_participants : "includes"
    threads ||--o{ messages : "contains"
    members ||--o{ member_skills : "has"
    members ||--o{ member_experience : "has"
    members ||--o{ member_education : "has"
```

---

### MongoDB Collections (schema-free, shown as reference)

| Collection | Key Fields | TTL |
|---|---|---|
| `events` | `idempotency_key` (unique), `event_type`, `_received_at`, `_topic` | 90 days |
| `ai_traces` | `task_id`, `trace_id`, `steps[]`, `status` | none (audit) |
| `resumes` | `member_id`, `skills[]`, `embeddings[]` | until deletion |
| `profile_views` | `viewer_id`, `viewed_id`, `viewed_at` | 90 days |
