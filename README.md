# LinkedInClone

LinkedIn-like distributed system for SJSU Distributed Systems course project.

## Due Dates
- API Document: April 7
- Presentation: April 28
- Final Demo: May 5

## Tech Stack
| Layer | Tech |
|---|---|
| Frontend | React |
| Backend Services | Node.js + Express |
| AI Service | FastAPI |
| Relational DB | MySQL |
| Document/Event DB | MongoDB |
| Messaging | Apache Kafka |
| Cache | Redis |
| Containers | Docker / Docker Compose |
| Cloud | AWS ECS or Kubernetes |

## Team Roles
| Member | Role |
|---|---|
| Member 1 | Backend Services (Profile, Job, Application) + Infra Foundation |
| Member 2 | Frontend (React UI) |
| Member 3 | Agentic AI Service |
| Member 4 | Kafka + Messaging + Connections |
| Member 5 | Analytics + Redis + Performance |
| Member 6 | Data Engineering + Testing + Documentation |

## Architecture Diagram
> Placeholder: add final distributed architecture diagram in `docs/architecture-diagram.png`.

## Monorepo Structure
- `frontend/`
- `services/profile/`
- `services/job/`
- `services/application/`
- `services/messaging/`
- `services/connection/`
- `services/analytics/`
- `services/ai-agent/`
- `services/shared/`
- `infra/`
- `data/`
- `docs/`
- `tests/`

## Integration rules (team)
- **CI / main:** Do not merge broken work; use feature flags for unfinished features.
- **API & Kafka:** The frozen contract is `docs/submission/LinkedInClone_API_Documentation.md` (endpoints, health JSON, event envelope) — coordinate changes with the team after the freeze date in that doc.
- **Ports:** Fixed map in the same document Part 1; do not reassign service ports in code without team-wide updates.
- **Postman:** Canonical collection is `docs/LinkedInClone.postman_collection.json` (copy under `docs/submission/` must stay byte-identical; CI enforces this).

## Setup (Skeleton)
1. Copy `.env.example` to `.env`. **`DB_PASS` must match the MySQL root password** in Docker (`MYSQL_ROOT_PASSWORD` in compose, default `linkedin`). **Do not** change `DB_PASS` in `.env` after the first `mysql_data` volume was created without resetting the volume or the password in the running DB.
2. **MySQL port:** the compose file publishes MySQL on **host `3307`** (maps to 3306 in the container) so it does not clash with another MySQL on your machine using 3306. **`.env` must have `DB_HOST=127.0.0.1` and `DB_PORT=3307`** for local Node services.
3. Start infra (repo root): `docker compose up -d` (uses root `docker-compose.yml`) or `docker compose -f infra/docker-compose.yml up -d` — from repo root so `.env` is applied to compose variable substitution.
4. First boot loads `data/schema.sql` and `data/mongo_setup.js` into the containers.
5. Start each service (e.g. `cd services/profile && npm start`); use the API doc for ports **8001–8007** (application ports, not the DB port).
