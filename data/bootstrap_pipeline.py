#!/usr/bin/env python3
"""
Bootstrap the full Kaggle -> transformed seeds -> MySQL/Mongo pipeline.

This script is intended to run as a required startup prerequisite for the full
app stack. It prepares raw files, generates JSON seeds, and then loads the DBs.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import boto3
import mysql.connector
from pymongo import MongoClient


BASE = Path(__file__).parent
RAW_DIR = Path(os.getenv("RAW_DIR", "/tmp/linkedinclone/raw"))
SEEDS_DIR = Path(os.getenv("SEEDS_DIR", "/tmp/linkedinclone/seeds"))
SOURCE_DIR = Path(os.getenv("PIPELINE_SOURCE_DIR", "/workspace/Data_2"))
JOBS_DATASET = os.getenv("KAGGLE_JOBS_DATASET", "rajatraj0502/linkedin-job-2023")
RESUME_DATASET = os.getenv("KAGGLE_RESUME_DATASET", "snehaanbhawal/resume-dataset")
AWS_REGION = os.getenv("AWS_REGION", os.getenv("AWS_DEFAULT_REGION", "us-west-1"))
APP_SECRETS_SECRET_ID = os.getenv("APP_SECRETS_SECRET_ID", "")
KAGGLE_SECRETS_SECRET_ID = os.getenv("KAGGLE_SECRETS_SECRET_ID", "")
DATASET_S3_BUCKET = os.getenv("DATASET_S3_BUCKET", "")
DATASET_S3_PREFIX = os.getenv("DATASET_S3_PREFIX", "").strip("/")
EXPECTED_COUNTS = {
    "members": 10_000,
    "recruiters": 10_000,
    "jobs": 10_000,
    "applications": 50_000,
    "posts": 2_500,
    "events": 100_000,
}


def log(message: str) -> None:
    print(f"[data-bootstrap] {message}", flush=True)


def load_json_secret(secret_id: str) -> dict[str, str]:
    if not secret_id:
        return {}
    client = boto3.client("secretsmanager", region_name=AWS_REGION)
    response = client.get_secret_value(SecretId=secret_id)
    secret_string = response.get("SecretString") or "{}"
    import json

    payload = json.loads(secret_string)
    return payload if isinstance(payload, dict) else {}


def load_runtime_secrets() -> None:
    for secret_id, env_map in (
        (
            APP_SECRETS_SECRET_ID,
            {
                "openai_api_key": "OPENAI_API_KEY",
                "dataset_s3_bucket": "DATASET_S3_BUCKET",
                "dataset_s3_prefix": "DATASET_S3_PREFIX",
            },
        ),
        (
            KAGGLE_SECRETS_SECRET_ID,
            {
                "kaggle_username": "KAGGLE_USERNAME",
                "kaggle_key": "KAGGLE_KEY",
            },
        ),
    ):
        secret_payload = load_json_secret(secret_id)
        for secret_key, env_key in env_map.items():
            if secret_payload.get(secret_key) and not os.getenv(env_key):
                os.environ[env_key] = str(secret_payload[secret_key])


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def resolve_resume_file(root: Path) -> Path | None:
    candidates = [
        root / "Resume" / "Resume.csv",
        root / "resume" / "Resume.csv",
        root / "Company And Resume " / "Resume" / "Resume.csv",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    matches = list(root.rglob("Resume.csv"))
    return matches[0] if matches else None


def resolve_jobs_file(root: Path) -> Path | None:
    candidates = [
        root / "job_postings.csv",
        root / "Companies" / "job_postings.csv",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    matches = list(root.rglob("job_postings.csv"))
    return matches[0] if matches else None


def resolve_companies_file(root: Path) -> Path | None:
    candidates = [
        root / "companies.csv",
        root / "Companies" / "companies.csv",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    matches = list(root.rglob("companies.csv"))
    return matches[0] if matches else None


def raw_files_present(root: Path) -> bool:
    return all(
        [
            (root / "job_postings.csv").exists(),
            (root / "companies.csv").exists(),
            (root / "Resume" / "Resume.csv").exists(),
        ]
    )


def copy_resolved_inputs(source_root: Path, dest_root: Path) -> bool:
    jobs = resolve_jobs_file(source_root)
    companies = resolve_companies_file(source_root)
    resume = resolve_resume_file(source_root)
    if not all([jobs, companies, resume]):
        return False

    ensure_dir(dest_root / "Resume")
    shutil.copy2(jobs, dest_root / "job_postings.csv")
    shutil.copy2(companies, dest_root / "companies.csv")
    shutil.copy2(resume, dest_root / "Resume" / "Resume.csv")
    log(f"prepared raw dataset files in {dest_root}")
    return True


def kaggle_credentials_available() -> bool:
    return bool(
        os.getenv("KAGGLE_USERNAME")
        and os.getenv("KAGGLE_KEY")
        or Path.home().joinpath(".kaggle", "kaggle.json").exists()
    )


def run_cmd(cmd: list[str], env: dict[str, str]) -> None:
    log(f"running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True, env=env)


def s3_key(*parts: str) -> str:
    return "/".join(part.strip("/") for part in parts if part and part.strip("/"))


def download_from_s3(dest_root: Path) -> bool:
    bucket = os.getenv("DATASET_S3_BUCKET", DATASET_S3_BUCKET)
    if not bucket:
        return False

    prefix = os.getenv("DATASET_S3_PREFIX", DATASET_S3_PREFIX).strip("/")
    client = boto3.client("s3", region_name=AWS_REGION)
    required = [
        (s3_key(prefix, "job_postings.csv"), dest_root / "job_postings.csv"),
        (s3_key(prefix, "companies.csv"), dest_root / "companies.csv"),
        (s3_key(prefix, "Resume", "Resume.csv"), dest_root / "Resume" / "Resume.csv"),
    ]
    try:
        for key, target in required:
            ensure_dir(target.parent)
            client.download_file(bucket, key, str(target))
        log(f"downloaded raw dataset files from s3://{bucket}/{prefix}")
        return True
    except Exception as exc:
        log(f"s3 dataset download unavailable: {exc}")
        return False


def upload_required_inputs_to_s3(source_root: Path) -> bool:
    bucket = os.getenv("DATASET_S3_BUCKET", DATASET_S3_BUCKET)
    if not bucket:
        return False

    jobs = resolve_jobs_file(source_root)
    companies = resolve_companies_file(source_root)
    resume = resolve_resume_file(source_root)
    if not all([jobs, companies, resume]):
        return False

    prefix = os.getenv("DATASET_S3_PREFIX", DATASET_S3_PREFIX).strip("/")
    client = boto3.client("s3", region_name=AWS_REGION)
    uploads = [
        (jobs, s3_key(prefix, "job_postings.csv")),
        (companies, s3_key(prefix, "companies.csv")),
        (resume, s3_key(prefix, "Resume", "Resume.csv")),
    ]
    for source_path, key in uploads:
        client.upload_file(str(source_path), bucket, key)
    log(f"uploaded normalized raw dataset files to s3://{bucket}/{prefix}")
    return True


def fetch_mysql_counts() -> dict[str, int]:
    conn = mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASS", ""),
        database=os.getenv("DB_NAME", "linkedinclone"),
        connection_timeout=30,
    )
    try:
        cur = conn.cursor()
        counts = {}
        for table in ("members", "recruiters", "jobs", "applications", "posts"):
            cur.execute(f"SELECT COUNT(*) FROM `{table}`")
            counts[table] = int(cur.fetchone()[0])
        cur.close()
        return counts
    finally:
        conn.close()


def ensure_mysql_schema() -> None:
    schema_path = BASE / "schema.sql"
    sql = schema_path.read_text(encoding="utf-8")
    conn = mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASS", ""),
        database=os.getenv("DB_NAME", "linkedinclone"),
        connection_timeout=30,
    )
    try:
        cur = conn.cursor()
        statements = [stmt.strip() for stmt in sql.split(";") if stmt.strip()]
        for statement in statements:
            cur.execute(statement)
        conn.commit()
        cur.close()
        log("ensured MySQL schema is present")
    finally:
        conn.close()


def fetch_mongo_counts() -> dict[str, int]:
    client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"), serverSelectionTimeoutMS=5000)
    try:
        db = client[os.getenv("DB_NAME", "linkedinclone")]
        return {
            "events": int(db.events.count_documents({})),
        }
    finally:
        client.close()


def check_seed_state() -> str:
    mysql_counts = fetch_mysql_counts()
    mongo_counts = fetch_mongo_counts()
    observed = {**mysql_counts, **mongo_counts}

    if all(observed[key] == 0 for key in EXPECTED_COUNTS):
        return "empty"

    if all(observed[key] == EXPECTED_COUNTS[key] for key in EXPECTED_COUNTS):
        log(f"seed already present; skipping bootstrap: {observed}")
        return "complete"

    raise RuntimeError(
        "database contains a partial or unexpected seeded state "
        f"({observed}). Reset the DB volumes before rerunning startup."
    )


def download_from_kaggle(dest_root: Path) -> None:
    ensure_dir(dest_root)
    env = os.environ.copy()
    env.setdefault("KAGGLE_CONFIG_DIR", str(Path.home() / ".kaggle"))

    downloads_root = dest_root / "_downloads"
    ensure_dir(downloads_root)

    run_cmd(
        [sys.executable, "-m", "kaggle.cli", "datasets", "download", "-d", JOBS_DATASET, "--unzip", "-p", str(downloads_root / "jobs")],
        env,
    )
    run_cmd(
        [sys.executable, "-m", "kaggle.cli", "datasets", "download", "-d", RESUME_DATASET, "--unzip", "-p", str(downloads_root / "resumes")],
        env,
    )

    if not copy_resolved_inputs(downloads_root, dest_root):
        raise RuntimeError("downloaded Kaggle archives but could not resolve required raw files")

    upload_required_inputs_to_s3(dest_root)


def ensure_raw_inputs() -> None:
    ensure_dir(RAW_DIR)
    if raw_files_present(RAW_DIR):
        log(f"raw inputs already present in {RAW_DIR}")
        return

    if download_from_s3(RAW_DIR):
        return

    if SOURCE_DIR.exists() and copy_resolved_inputs(SOURCE_DIR, RAW_DIR):
        upload_required_inputs_to_s3(RAW_DIR)
        return

    if kaggle_credentials_available():
        log("raw inputs not found locally; downloading from Kaggle")
        download_from_kaggle(RAW_DIR)
        return

    raise RuntimeError(
        "required raw dataset files are missing. Provide PIPELINE_SOURCE_DIR with the Kaggle files "
        "or KAGGLE_USERNAME/KAGGLE_KEY (or ~/.kaggle/kaggle.json) so startup can download them."
    )


def main() -> int:
    load_runtime_secrets()
    ensure_mysql_schema()
    seed_state = check_seed_state()
    if seed_state == "complete":
        return 0

    ensure_dir(SEEDS_DIR)
    ensure_raw_inputs()

    env = os.environ.copy()
    env["RAW_DIR"] = str(RAW_DIR)
    env["SEEDS_DIR"] = str(SEEDS_DIR)

    run_cmd([sys.executable, str(BASE / "transform.py")], env)
    run_cmd([sys.executable, str(BASE / "seed_loader.py")], env)
    log("pipeline complete")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        log(f"command failed with exit code {exc.returncode}")
        raise
    except Exception as exc:
        log(f"bootstrap failed: {exc}")
        raise
