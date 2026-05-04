## Data pipeline (Kaggle → seeds → MySQL / MongoDB)

The repo ships a full pipeline:

- **`data/bootstrap_pipeline.py`**: one-shot orchestration (download or copy raw files, transform, load). Used by the **`data-bootstrap`** Docker Compose service so the rest of the stack starts with data present.
- **`data/transform.py`**: raw inputs → `data/seeds/*.json`
- **`data/seed_loader.py`**: loads seeds into **MySQL** and **MongoDB** (idempotent)

### Datasets (defaults)

- **Jobs:** `rajatraj0502/linkedin-job-2023` (override with **`KAGGLE_JOBS_DATASET`**)
- **Resumes:** `snehaanbhawal/resume-dataset` (override with **`KAGGLE_RESUME_DATASET`**)
- Optional extras (SNAP graphs, extra job CSVs) can be wired later in `transform.py`; see historical notes in git for optional dataset IDs.

### Docker Compose (`data-bootstrap`)

From the **repository root**:

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

The **`data-bootstrap`** service:

1. Waits for **MySQL** and **MongoDB** to be healthy.
2. Loads **repository root** `.env` via Compose **`env_file`** so **`KAGGLE_USERNAME`** / **`KAGGLE_KEY`** and related variables reach the container. (Compose is invoked with `-f infra/docker-compose.yml`, so substitution defaults in the compose file alone would not pick up a root `.env` for those keys; the service is configured to load **`../.env`** explicitly.)
3. Reads raw data from **`PIPELINE_SOURCE_DIR`** (default **`/workspace/Data_2`** inside the container, i.e. repo-root **`Data_2/`** when present) **or** downloads from Kaggle when credentials and network allow.
4. Runs **`transform.py`** then **`seed_loader.py`**. Exit code **0** means success; the container is expected to **exit** while the rest of the stack keeps running.

Check the last run:

```bash
docker inspect linkedinclone-data-bootstrap --format '{{.State.ExitCode}}'
```

### AWS (optional, typical for ECS)

If **`KAGGLE_SECRETS_SECRET_ID`** or **`APP_SECRETS_SECRET_ID`** are set and the runtime has IAM / network access to AWS Secrets Manager, `bootstrap_pipeline.py` can merge secret payloads into the environment before downloads. Local Compose usually relies on **root `.env`** or **`Data_2/`** instead.

### Host-only workflow (no bootstrap container)

Install deps:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r data/requirements.txt
```

**Download** (Kaggle CLI; `~/.kaggle/kaggle.json` or equivalent env vars on the host):

```bash
bash data/download_kaggle.sh
```

Or place files manually under **`data/raw/`** (see `transform.py` for expected names).

**Transform and load** (with DBs reachable from the host):

```bash
python3 data/transform.py
python3 data/seed_loader.py
```

### Notes

- The loader is **idempotent** (`INSERT IGNORE` / Mongo upserts), so re-runs are safe.
- For a full stack reset including volumes: `docker compose -f infra/docker-compose.yml down -v`, then bring the stack up again so MySQL re-init and bootstrap run from a clean state.
