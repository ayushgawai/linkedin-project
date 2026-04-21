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
- AWS env template: [.env.aws.example](/Users/spartan/Documents/GitHub/Linkedin-Project/.env.aws.example:1)
- ECR bootstrap stack: [member1-ecr.yaml](/Users/spartan/Documents/GitHub/Linkedin-Project/infra/aws/member1-ecr.yaml:1)
- App stack: [member1-ecs-rds.yaml](/Users/spartan/Documents/GitHub/Linkedin-Project/infra/aws/member1-ecs-rds.yaml:1)
- Bootstrap script: [member1_aws_bootstrap.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/member1_aws_bootstrap.sh:1)
- Deploy script: [member1_aws_deploy.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/member1_aws_deploy.sh:1)
- Demo seed: [member1_demo_seed.sql](/Users/spartan/Documents/GitHub/Linkedin-Project/data/member1_demo_seed.sql:1)
- Smoke test: [member1_smoke_test.sh](/Users/spartan/Documents/GitHub/Linkedin-Project/scripts/member1_smoke_test.sh:1)
