# Data storage split (MySQL vs MongoDB)

This project uses **both MySQL and MongoDB**, based on the shape of data and the access patterns.

## What goes in MySQL (transactional / relational / consistency)

- **Members / recruiters / jobs / applications**: transactional records with strong consistency needs (e.g., *duplicate application*, *apply to closed job*, status transitions).
- **Connections (canonical relationship state)**: a relationship edge with unique constraints, normalized pairs, and status transitions (`pending` → `accepted`/`rejected`) where uniqueness and atomic updates matter.

Why MySQL:
- **Constraints + joins**: unique edge per (user_a, user_b), counts, dashboards, and relationships are naturally relational.
- **Transactions/rollbacks**: required for multi-step consistency and failure modes.

## What goes in MongoDB (document / log / high-volume / flexible)

- **Connections (mirrored edge documents)**: **required by the professor** (“use MySQL + MongoDB for connections”). The Connection service mirrors each create/accept/reject into MongoDB `connections` documents keyed by `(user_a, user_b)` with timestamps.
- **Events/logging/analytics**: high-write event streams and flexible schema (clickstream-style payloads).
- **AI traces / step logs**: heterogeneous per-step payloads and evolving schemas.

Why MongoDB:
- **Flexible schema** for logs/traces that evolve quickly.
- **Write-heavy** append workloads (events) without forcing strict relational schema changes.

## Connections: how we use both stores (non-duplicative)

- **MySQL**: canonical **request workflow** (pending/rejected), uniqueness constraints, and transactional updates.
- **MongoDB**: canonical **accepted connections graph** (document edges), used for fast graph reads like `list` and `mutual`.

We do **not** duplicate the full request lifecycle in MongoDB. MongoDB only stores edges once they become `accepted` (and deletes on reject), which is a clean “SQL for workflow, NoSQL for graph reads” split.

## Resumes / “unstructured data”

For this codebase, **applications store `resume_text`** in MySQL (`MEDIUMTEXT`) because it is directly tied to an application record and needs transactional behavior with the application submission flow. If the team later stores raw PDFs or large extracted JSON, MongoDB is also appropriate for those documents (but the current implementation focuses on correctness + required flows).

