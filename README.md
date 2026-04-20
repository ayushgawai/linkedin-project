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

## Data Pipeline (Member 6)

### Datasets
| Dataset | Source | Contents |
|---|---|---|
| LinkedIn Job Postings 2023 | [Kaggle](https://www.kaggle.com/datasets/rajatraj0502/linkedin-job-2023) | 15K jobs, companies, skills |
| Resume Dataset | [Kaggle](https://www.kaggle.com/datasets/snehaanbhawal/resume-dataset) | 2.4K resumes across 24 categories |

Raw CSVs are **not committed** (gitignored). Download them into `data/raw/` before running the pipeline.

### How to seed the database

**Prerequisites:** Python 3.11, MySQL running, MongoDB running.

```bash
# 1. Install dependencies
pip3.11 install pandas faker mysql-connector-python pymongo python-dotenv kaggle

# 2. Download datasets (requires Kaggle API token at ~/.kaggle/kaggle.json)
cd data/raw
kaggle datasets download -d rajatraj0502/linkedin-job-2023 --unzip
kaggle datasets download -d snehaanbhawal/resume-dataset --unzip
cd ../..

# 3. Transform raw CSVs → clean JSON seeds
python3.11 data/transform.py

# 4. Load seeds into MySQL + MongoDB
python3.11 data/seed_loader.py
```

**Expected output after seeding:**

| Table / Collection | Count |
|---|---|
| members | 10,000 |
| recruiters | 10,000 |
| jobs | 10,000 |
| applications | ~50,000 |
| connections | 10,000 |
| MongoDB events | 100,000+ |

The seed loader is **idempotent** — safe to run multiple times without creating duplicates.

## Running Tests

```bash
pip3.11 install pytest pytest-cov requests
pytest tests/ -v
```

Tests require the microservices to be running on their respective ports (8001–8007). Tests skip gracefully if a service is not reachable.
