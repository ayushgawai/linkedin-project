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
| Cloud | AWS ECS Fargate + CloudFormation |

## Team Roles
| Name | Responsibility |
|---|---|
| Ayush Sunil Gawai | Backend Services (Profile, Job, Application) + Deployment (AWS/Docker) + Git & CI/CD config |
| Manav Patel | Frontend developer for the React UI |
| Bhoomika Lnu | Agentic AI service with FastAPI and LLM orchestration |
| Khushi Donda | Kafka, Messaging, and Connections services |
| Naman Vipul Chheda | Analytics, dashboards, Redis caching, and performance |
| Centhurvelan Ramalingam Sakthivel | Documentation owner; support for Naman and Parth |
| Sharan Somshekhar Patil | Data engineering, testing, and presentation support |
| Parth Patel | Integration, merge coordination, unit testing, and integration testing |

## Architecture Diagram
See [LinkedInClone_Architecture_Diagram.png](/Users/spartan/Documents/GitHub/Linkedin-Project/docs/submission/LinkedInClone_Architecture_Diagram.png:1).

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

## Deployment Guide

Use [aws-deployment-runbook.md](/Users/spartan/Documents/GitHub/Linkedin-Project/docs/aws-deployment-runbook.md:1) as the canonical AWS deployment document.

Useful files:
- Single env template: [.env.example](/Users/spartan/Documents/GitHub/Linkedin-Project/.env.example:1)
- ECR bootstrap stack: [backend-ecr.yaml](/Users/spartan/Documents/GitHub/Linkedin-Project/infra/aws/backend-ecr.yaml:1)
- App stack: [backend-platform.yaml](/Users/spartan/Documents/GitHub/Linkedin-Project/infra/aws/backend-platform.yaml:1)
- Bootstrap script: [aws_bootstrap_backend.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/aws_bootstrap_backend.sh:1)
- Deploy script: [aws_deploy_backend.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/aws_deploy_backend.sh:1)
- Destroy script: [aws_destroy_backend.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/aws_destroy_backend.sh:1)
- Cost-stop script: [aws_stop_backend_costs.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/aws_stop_backend_costs.sh:1)
- Demo seed: [backend_demo_seed.sql](/Users/spartan/Documents/GitHub/Linkedin-Project/data/backend_demo_seed.sql:1)
- Smoke test: [backend_smoke_test.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/backend_smoke_test.sh:1)

## Team Rules

- The professor project document in `personal/internal_docs/Class_Project_Description_LinkedIn_AgenticAI.docx` is the highest-priority source of truth for requirements.
- The team should re-check implementation and documentation against the professor document regularly, especially before merge, demo, and deployment.
- Internal prompts, personal notes, and branch-specific plans can help execution, but they do not override the professor document.
- Every branch should keep GitHub Actions green before requesting review or merge.
- Minimum CI expectation for all contributors: do not merge with failing workflow runs.
- Before pushing significant changes, run local validation relevant to your scope, and at minimum run `npm test` when touching shared repo behavior or CI-checked files.
- Keep API contracts, docs, and code aligned; if one changes, update the others in the same branch.
- Parth owns merge coordination; no one should merge unreviewed work directly into the main integration branch.
