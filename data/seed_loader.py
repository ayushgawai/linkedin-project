#!/usr/bin/env python3
"""
seed_loader.py — Load seed JSON files into MySQL and MongoDB.

Reads from:  data/seeds/
Connects to: MySQL and MongoDB via .env

Features:
  - Idempotent: safe to run multiple times (INSERT IGNORE / upsert)
  - Batch size: configurable via SEED_MYSQL_BATCH (default 100); commits after each batch
    to avoid MySQL 2013 "Lost connection" on large TEXT payloads (jobs, applications).
  - Progress logging with row counts
  - Final SELECT COUNT(*) for every table and collection

Usage:
    cd linkedinclone/
    python3 data/seed_loader.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Optional

import mysql.connector
from pymongo import MongoClient, InsertOne
from pymongo.errors import BulkWriteError
from pymongo.errors import OperationFailure
from dotenv import load_dotenv

# ── Load .env ──────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
load_dotenv(ROOT / ".env")

DB_HOST   = os.getenv("DB_HOST", "localhost")
DB_PORT   = int(os.getenv("DB_PORT", 3306))
DB_USER   = os.getenv("DB_USER", "root")
DB_PASS   = os.getenv("DB_PASS", "")
DB_NAME   = os.getenv("DB_NAME", "linkedinclone")
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")

SEEDS = Path(__file__).parent / "seeds"
# Small default: jobs/applications rows include large TEXT; one huge txn often triggers 2013.
BATCH = max(25, int(os.getenv("SEED_MYSQL_BATCH", "100")))
MONGO_BATCH = max(50, int(os.getenv("SEED_MONGO_BATCH", "500")))


# ── Utilities ──────────────────────────────────────────────────────────────────

def load_json(filename: str) -> list:
    path = SEEDS / filename
    if not path.exists():
        print(f"  [WARN] {filename} not found — skipping")
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def batch_iter(lst: list, size: int):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


def mysql_insert_ignore(conn, cursor, table: str, rows: list, columns: list, batch_size: int) -> int:
    """INSERT IGNORE in batches; commit after each batch to limit packet/txn size (avoids error 2013)."""
    if not rows:
        return 0
    placeholders = ", ".join(["%s"] * len(columns))
    col_list = ", ".join(f"`{c}`" for c in columns)
    sql = f"INSERT IGNORE INTO `{table}` ({col_list}) VALUES ({placeholders})"
    total = 0
    for batch in batch_iter(rows, batch_size):
        values = [tuple(row.get(c) for c in columns) for row in batch]
        cursor.executemany(sql, values)
        total += cursor.rowcount
        conn.commit()
    return total


# ── MySQL loader ───────────────────────────────────────────────────────────────

def load_mysql():
    print("\n" + "=" * 60)
    print("Connecting to MySQL...")
    conn = mysql.connector.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        allow_local_infile=True,
        connection_timeout=120,
        autocommit=False,
    )
    cur = conn.cursor()
    # Reduce dropped connections on long bulk loads (Docker MySQL defaults can be tight).
    for stmt in (
        "SET SESSION net_read_timeout = 600",
        "SET SESSION net_write_timeout = 600",
        "SET SESSION wait_timeout = 600",
        "SET SESSION interactive_timeout = 600",
        "SET SESSION max_allowed_packet = 67108864",
    ):
        try:
            cur.execute(stmt)
        except mysql.connector.Error:
            pass  # some managed instances restrict SESSION max_allowed_packet
    conn.commit()

    # Disable FK checks for bulk load, re-enable after
    cur.execute("SET FOREIGN_KEY_CHECKS = 0;")
    cur.execute("SET UNIQUE_CHECKS = 0;")
    conn.commit()

    def insert(table, filename, columns, batch_size: Optional[int] = None):
        rows = load_json(filename)
        if not rows:
            return
        bs = batch_size if batch_size is not None else BATCH
        inserted = mysql_insert_ignore(conn, cur, table, rows, columns, bs)
        print(f"  {table:<25} {len(rows):>8,} in file   {inserted:>8,} inserted")

    print("Loading tables...")

    insert("members", "members.json", [
        "member_id", "first_name", "last_name", "email", "phone",
        "location", "headline", "about", "profile_photo_url",
        "connections_count", "created_at", "updated_at",
    ])

    insert("recruiters", "recruiters.json", [
        "recruiter_id", "company_id", "name", "email", "phone",
        "company_name", "company_industry", "company_size",
        "role", "access_level", "created_at",
    ])

    insert(
        "jobs",
        "jobs.json",
        [
            "job_id", "company_id", "recruiter_id", "title", "description",
            "seniority_level", "employment_type", "location", "remote_type",
            "salary_range", "status", "posted_datetime", "views_count", "applicants_count",
        ],
        batch_size=max(25, BATCH // 2),
    )

    insert("job_skills", "job_skills.json", ["job_id", "skill"])

    insert(
        "applications",
        "applications.json",
        [
            "application_id", "job_id", "member_id", "resume_url",
            "resume_text", "cover_letter", "application_datetime", "status",
        ],
        batch_size=max(25, BATCH // 2),
    )

    insert("member_skills", "member_skills.json", ["member_id", "skill"])

    insert("member_experience", "member_experience.json", [
        "exp_id", "member_id", "company", "title",
        "start_date", "end_date", "description", "is_current",
    ])

    insert("member_education", "member_education.json", [
        "edu_id", "member_id", "institution", "degree",
        "field", "start_year", "end_year",
    ])

    insert("connections", "connections.json", [
        "connection_id", "user_a", "user_b", "status", "requested_by", "created_at",
    ])

    insert("threads", "threads.json", ["thread_id", "created_at"])

    insert("thread_participants", "thread_participants.json", ["thread_id", "user_id"])

    insert("messages", "messages.json", [
        "message_id", "thread_id", "sender_id", "message_text", "sent_at",
    ])

    cur.execute("SET FOREIGN_KEY_CHECKS = 1;")
    cur.execute("SET UNIQUE_CHECKS = 1;")
    conn.commit()

    # Final counts
    print("\nMySQL table counts:")
    tables = [
        "members", "recruiters", "jobs", "job_skills", "applications",
        "application_notes", "member_skills", "member_experience",
        "member_education", "connections", "threads", "thread_participants",
        "messages", "processed_events", "outbox_events",
    ]
    for t in tables:
        cur.execute(f"SELECT COUNT(*) FROM `{t}`")
        count = cur.fetchone()[0]
        print(f"  {t:<28} {count:>10,}")

    cur.close()
    conn.close()


# ── MongoDB loader ─────────────────────────────────────────────────────────────

def load_mongo():
    print("\n" + "=" * 60)
    print("Connecting to MongoDB...")
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    db = client[DB_NAME]

    # Ensure indexes exist
    def ensure_index(collection, keys, **kwargs):
        """
        Create an index if possible, but do not fail seeding if:
        - the index already exists, or
        - another index exists with the same autogenerated name.
        """
        try:
            collection.create_index(keys, **kwargs)
        except OperationFailure as e:
            msg = str(e)
            ignorable = (
                "IndexKeySpecsConflict" in msg
                or "IndexOptionsConflict" in msg
                or "already exists" in msg.lower()
                or "same name as the requested index" in msg.lower()
            )
            if not ignorable:
                raise

    ensure_index(db.events, [("event_type", 1), ("timestamp", -1)], name="events_eventType_ts")
    ensure_index(db.events, [("actor_id", 1), ("timestamp", -1)], name="events_actor_ts")
    ensure_index(db.events, [("entity.entity_id", 1)], name="events_entityId")
    ensure_index(db.events, "idempotency_key", unique=True, name="events_idempotency_unique")
    ensure_index(db.ai_traces, "task_id", unique=True, sparse=True, name="ai_traces_task_unique")
    ensure_index(db.ai_traces, "trace_id", name="ai_traces_trace")
    ensure_index(db.ai_traces, [("status", 1), ("created_at", -1)], name="ai_traces_status_createdAt")
    ensure_index(db.resumes, "member_id", name="resumes_memberId")
    ensure_index(db.profile_views, [("member_id", 1), ("viewed_at", -1)], name="profile_views_member_viewedAt")

    print("Loading events (100K — this takes ~30s)...")
    events = load_json("events.json")
    if events:
        inserted_total = 0
        skipped_total = 0
        for batch in batch_iter(events, MONGO_BATCH):
            ops = [InsertOne(doc) for doc in batch]
            try:
                result = db.events.bulk_write(ops, ordered=False)
                inserted_total += result.inserted_count
            except BulkWriteError as e:
                inserted_total += e.details.get("nInserted", 0)
                skipped_total  += len([
                    err for err in e.details.get("writeErrors", [])
                    if err.get("code") == 11000  # duplicate key
                ])
        print(f"  events   {len(events):>8,} in file   {inserted_total:>8,} inserted   {skipped_total:>6,} skipped (dup)")

    # Final counts
    print("\nMongoDB collection counts:")
    for col in ["events", "ai_traces", "resumes", "profile_views"]:
        count = db[col].count_documents({})
        print(f"  {col:<28} {count:>10,}")

    client.close()


# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("seed_loader.py — LinkedIn Clone Data Seeder")
    print("=" * 60)

    try:
        load_mysql()
    except Exception as e:
        print(f"\n[ERROR] MySQL load failed: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        load_mongo()
    except Exception as e:
        print(f"\n[ERROR] MongoDB load failed: {e}", file=sys.stderr)
        sys.exit(1)

    print("\n" + "=" * 60)
    print("Seeding complete.")
    print("=" * 60)
