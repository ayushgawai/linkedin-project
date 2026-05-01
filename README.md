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

## Architecture diagram
Submission-ready diagrams live under `docs/submission/`:

- `LinkedInClone_Architecture_Diagram.svg`
- `LinkedInClone_Architecture_Diagram.png`

## Monorepo structure
- `Linkedin Frontend/` *(React UI for member, recruiter, AI copilot, and analytics flows.)*
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
1. Copy `.env.example` to `.env` in the **repository root** and set host port overrides if needed (for example `DB_PORT_HOST=3307` if port 3306 is already in use).
2. From the repo root, start the stack:

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

This starts MySQL, MongoDB, Redis, Zookeeper, Kafka, Profile, Job, Application, Messaging, Connection, Analytics, AI Agent, and the API Gateway.

3. The API Gateway is exposed on `http://127.0.0.1:8011` and should be used as the frontend/backend entrypoint.
4. MySQL runs `data/schema.sql` on first MySQL data volume; use the data pipeline below for large CSV-driven seeds.
5. Use Docker for full integration; run Node services on the host only when you specifically need hot reload.

### Host ports (default)
| Service | Port |
|--------|------|
| API Gateway | 8011 |
| Profile | 8001 |
| Job | 8002 |
| Application | 8003 |
| Messaging | 8004 |
| Connection | 8005 |
| Analytics | 8006 |
| AI Agent (FastAPI) | 8007 |
| MySQL (host) | 3307 |
| Redis | 6379 |
| MongoDB | 27017 |
| Kafka | 9092 |

### Verify the stack
After `docker compose` is healthy, hit every service (equivalent to what pytest uses for reachability checks):

```bash
./scripts/stack_health_smoke.sh
```

Narrower smoke (Member 1 services + sample API calls only): `bash scripts/member1_smoke_test.sh`.

### Run the frontend after pulling `main`
Use the gateway-backed frontend config by default:

```bash
cd "Linkedin Frontend"
cp .env.example .env.local
npm install
npm run dev
```

The checked-in frontend example config points to:
- `http://127.0.0.1:8011` for HTTP
- `ws://127.0.0.1:8011` for WebSockets
- `VITE_USE_MOCKS=false` for full-stack integration mode

Open the Vite URL shown in the terminal and use the app through the gateway instead of individual service ports.

## Branching
**`main`** is the integration branch: open feature work in short-lived branches and merge through pull requests. The historical integration branch is merged; do not point new work at obsolete `integration/*` names unless a maintainer reopens a dedicated integration line.

### Backend-only validation
If you are not running the React UI, validate the integrated stack with contract tests, `pytest`, the smoke scripts above, or API clients (for example the Postman collection under `docs/submission/`).

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

**Node (CI; no containers required for this job):**

```bash
npm ci   # or npm install
npm test
```

Runs Member 1 in-memory service tests, analytics unit tests, and the submission API documentation contract check (same steps as GitHub Actions).

**Python HTTP tests** (integration tests call `localhost:8001–8007`; tests **skip** services that are not reachable, which is expected when Docker is not running):

```bash
pip3.11 install pytest requests
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python3.11 -m pytest tests/ -q -o addopts=
```

With the stack up, the skip count should drop; integration flows need profile, job, and application at minimum.

**Postman** — valid JSON and manual runs:

```bash
python3 - <<'PY'
import json
from pathlib import Path
path = Path("docs/submission/LinkedInClone_API_Collection.postman_collection.json")
json.loads(path.read_text(encoding="utf-8"))
print("Postman collection JSON is valid")
PY
```
