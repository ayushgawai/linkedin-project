## Data pipeline (Kaggle/SNAP → seeds → DB)

This repo already includes a **data pipeline**:

- `data/transform.py`: converts raw Kaggle/SNAP files into `data/seeds/*.json`
- `data/seed_loader.py`: loads seeds into **MySQL** and **MongoDB**

### Datasets (professor-provided)

- **Jobs**
  - LinkedIn Job 2023: `rajatraj0502/linkedin-job-2023`
  - LinkedIn Data Jobs Dataset: `joykimaiyo18/linkedin-data-jobs-dataset` (optional)
- **Resumes (AI Agent)**
  - Resume Dataset: `snehaanbhawal/resume-dataset`
  - Resume Classification (optional): `hassnainzaidi/resume-classification-dataset-for-nlp`
- **Connections (optional)**
  - SNAP social graphs / Kaggle mirror `wolfram77/graphs-social` (optional)

### Prereqs

Install python deps for the pipeline:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r data/requirements.txt
```

If you want automated Kaggle downloads, install Kaggle CLI and add credentials:

```bash
pip install kaggle
ls ~/.kaggle/kaggle.json
```

### 1) Download raw datasets

Option A (recommended): use the helper script (requires Kaggle credentials):

```bash
bash data/download_kaggle.sh
```

Option B: download manually from Kaggle and place files here:

- `data/raw/job_postings.csv`
- `data/raw/companies.csv`
- `data/raw/Resume/Resume.csv`

### 2) Transform raw → seeds

```bash
python3 data/transform.py
```

This writes `data/seeds/*.json`.

### 3) Load seeds into DBs

Start the stack:

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

Then load:

```bash
python3 data/seed_loader.py
```

### Notes

- The loader is **idempotent** (`INSERT IGNORE` / Mongo upserts) so re-running is safe.
- If you want to incorporate SNAP graphs into *realistic* connections, we can extend `transform.py`
  to build `connections.json` from an edge list. Right now it generates connections synthetically.

