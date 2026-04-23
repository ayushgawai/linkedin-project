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

## Architecture diagram
Submission-ready diagrams live under `docs/submission/`:

- `LinkedInClone_Architecture_Diagram.svg`
- `LinkedInClone_Architecture_Diagram.png`

## Monorepo structure
- `frontend/` *(React app — add here when the frontend branch lands; not yet in this repo)*
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

## Local setup
1. Copy `.env.example` to `.env` and adjust host ports if needed.
2. Start the stack: `docker compose -f infra/docker-compose.yml up -d` (MySQL, MongoDB, Redis, Zookeeper, Kafka, profile, job, application, messaging, connection, analytics, **ai-agent on 8007**).
3. MySQL loads `data/schema.sql` on first container start; use the data pipeline below for large seeds.
4. Run individual services locally only when you need hot reload; otherwise prefer Docker.

## Integration branch
Active integration work is merged on **`integration/parth/sequential-merge`** (Ayush → Naman → Khushi services → Sharan tests/data). Open a PR into `main` after review.

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

## Running tests

**Node (CI-aligned, no Docker required):**

```bash
npm install
npm test
```

This runs Member 1 in-memory service tests, analytics unit tests, and the submission API contract script.

**Python integration tests** (require services on ports 8001–8007; they skip when a service is down):

```bash
pip3.11 install pytest pytest-cov requests
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest tests/ -q -o addopts=
```
