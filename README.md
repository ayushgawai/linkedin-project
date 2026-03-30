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

## Setup (Skeleton)
1. Copy `.env.example` to `.env` and update values.
2. Start infra: `docker compose -f infra/docker-compose.yml up -d`.
3. Load DB schemas in `data/`.
4. Start services per folder instructions.
