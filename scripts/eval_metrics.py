#!/usr/bin/env python3
"""Evaluation Metrics Script for the AI Agent Service.

Queries MongoDB ai_traces and prints:
  1. Matching quality — Precision@5 (using a labelled test set)
  2. Approval rate — approve / edit / reject percentages
  3. Latency — p50 and p95 from the first pipeline step to the terminal
     ``complete`` step (using timestamps stored on each step in the
     ``steps`` array rather than DB create/update times — the former
     tracks the supervisor's actual work span, the latter drifts with
     Mongo write latency and is only used as a fallback)

Usage:
    python scripts/eval_metrics.py [--mongo-uri MONGO_URI] [--db DBNAME]

Requirements:
    pip install pymongo numpy
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from typing import Any, Iterable

try:
    import numpy as np
    from pymongo import MongoClient
except ImportError:
    print("ERROR: pymongo and numpy are required. Run: pip install pymongo numpy")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Labelled test set for Precision@5
# Each entry: job_skills (ground truth) + expected top member IDs
# ---------------------------------------------------------------------------

LABELLED_PAIRS = [
    {
        "label": "Backend Python Job",
        "job_skills": ["python", "fastapi", "mongodb", "kafka"],
        "expected_top_member_ids": ["mock-member-001", "mock-member-008"],
    },
    {
        "label": "Frontend React Job",
        "job_skills": ["javascript", "react", "typescript", "css"],
        "expected_top_member_ids": ["mock-member-002"],
    },
    {
        "label": "ML Engineer Job",
        "job_skills": ["python", "machine learning", "pytorch", "pandas"],
        "expected_top_member_ids": ["mock-member-004"],
    },
    {
        "label": "Java Backend Job",
        "job_skills": ["java", "spring", "kubernetes", "aws"],
        "expected_top_member_ids": ["mock-member-003"],
    },
    {
        "label": "DevOps Job",
        "job_skills": ["go", "kubernetes", "terraform", "aws"],
        "expected_top_member_ids": ["mock-member-005"],
    },
]

# Minimum Jaccard overlap between a task's job_skills and a labelled pair's
# job_skills for us to consider them the same scenario.
MIN_LABEL_OVERLAP = 0.4


def precision_at_k(predicted: list[str], relevant: list[str], k: int = 5) -> float:
    """Compute Precision@k: fraction of top-k predictions that are relevant."""
    top_k = predicted[:k]
    if not top_k:
        return 0.0
    hits = sum(1 for m in top_k if m in set(relevant))
    return hits / min(k, len(top_k))


def _jaccard(a: Iterable[str], b: Iterable[str]) -> float:
    sa = {s.strip().lower() for s in a if s}
    sb = {s.strip().lower() for s in b if s}
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _extract_task_job_skills(doc: dict) -> list[str]:
    """Pull the job skills/requirements that the task was run against.

    The supervisor emits a ``fetching_job``/``completed`` step whose
    ``partial_result`` carries ``job_skills``; fall back to the request
    payload's ``job_id_or_skills`` list if present.
    """
    steps = doc.get("steps") or []
    for step in steps:
        if step.get("step") == "fetching_job" and step.get("status") == "completed":
            partial = step.get("partial_result") or {}
            skills = partial.get("job_skills")
            if skills:
                return list(skills)
    payload = (doc.get("input") or {}).get("payload") or {}
    candidate = payload.get("job_skills") or payload.get("job_id_or_skills") or []
    # job_id_or_skills may legitimately be a job id string — filter those out.
    if isinstance(candidate, list):
        return [s for s in candidate if isinstance(s, str)]
    return []


def _best_matching_label(task_skills: list[str]) -> dict | None:
    """Return the labelled pair with highest Jaccard overlap, or None."""
    best: tuple[float, dict | None] = (0.0, None)
    for pair in LABELLED_PAIRS:
        score = _jaccard(task_skills, pair["job_skills"])
        if score > best[0]:
            best = (score, pair)
    if best[0] < MIN_LABEL_OVERLAP:
        return None
    return best[1]


def compute_precision_at_5(collection: Any) -> dict[str, Any]:
    """
    Estimate Precision@5 from completed shortlist tasks in MongoDB.

    Iterates over every completed shortlist task, maps it to the closest
    labelled pair by Jaccard overlap of job skills, and computes P@5 for
    that specific task. Aggregates per-label and overall means.
    """
    cursor = collection.find(
        {
            "task_type": "shortlist",
            "status": "completed",
            "result.shortlist": {"$exists": True},
        },
        sort=[("created_at", -1)],
    )

    per_task: list[dict[str, Any]] = []
    per_label_scores: dict[str, list[float]] = {p["label"]: [] for p in LABELLED_PAIRS}
    unmatched = 0

    for doc in cursor:
        task_skills = _extract_task_job_skills(doc)
        label_pair = _best_matching_label(task_skills)
        shortlist = doc.get("result", {}).get("shortlist", [])
        predicted_ids = [item.get("member_id") for item in shortlist if item.get("member_id")]

        if label_pair is None:
            unmatched += 1
            continue

        p5 = precision_at_k(predicted_ids, label_pair["expected_top_member_ids"], k=5)
        per_label_scores[label_pair["label"]].append(p5)
        per_task.append({
            "task_id": doc.get("task_id"),
            "label": label_pair["label"],
            "precision_at_5": round(p5, 4),
            "predicted_top5": predicted_ids[:5],
            "expected": label_pair["expected_top_member_ids"],
        })

    per_label_summary: list[dict[str, Any]] = []
    all_scores: list[float] = []
    for pair in LABELLED_PAIRS:
        scores = per_label_scores[pair["label"]]
        if scores:
            mean = sum(scores) / len(scores)
            per_label_summary.append({
                "label": pair["label"],
                "n_tasks": len(scores),
                "mean_precision_at_5": round(mean, 4),
            })
            all_scores.extend(scores)
        else:
            per_label_summary.append({
                "label": pair["label"],
                "n_tasks": 0,
                "mean_precision_at_5": None,
                "note": "No tasks matched this label",
            })

    mean_p5 = round(sum(all_scores) / len(all_scores), 4) if all_scores else None
    return {
        "per_task": per_task,
        "per_label": per_label_summary,
        "mean_precision_at_5": mean_p5,
        "tasks_without_label_match": unmatched,
    }


def compute_approval_rate(collection: Any) -> dict[str, Any]:
    """Count approve / edit / reject decisions across all tasks.

    Approval decisions are stored per-candidate in the ``approvals`` array
    on each task document (one element per recruiter decision). We unwind
    that array so every decision contributes independently to the totals —
    a task with three candidates actioned yields three rows, not one.
    """
    pipeline = [
        {"$match": {"approvals": {"$exists": True, "$ne": []}}},
        {"$unwind": "$approvals"},
        {"$group": {"_id": "$approvals.action", "count": {"$sum": 1}}},
    ]
    agg = list(collection.aggregate(pipeline))

    total = sum(r["count"] for r in agg)
    breakdown: dict[str, Any] = {}
    for r in agg:
        action = r["_id"] or "unknown"
        breakdown[action] = {
            "count": r["count"],
            "percentage": round(r["count"] / total * 100, 1) if total > 0 else 0.0,
        }

    # Also report how many tasks had at least one decision — useful for
    # interpreting the denominator when actions skew heavily to one bucket.
    tasks_with_any = collection.count_documents(
        {"approvals": {"$exists": True, "$ne": []}}
    )
    return {
        "total_decisions": total,
        "tasks_with_decisions": tasks_with_any,
        "breakdown": breakdown,
    }


def _parse_ts(value: Any) -> datetime | None:
    """Parse a timestamp stored either as datetime or ISO-8601 string."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _task_pipeline_latency(doc: dict) -> float | None:
    """Seconds between the first persisted step and the terminal ``complete``
    step, taken from each step's stored ``timestamp``. This is the pipeline
    span the supervisor observes — close to the ai.requested→ai.completed
    Kafka-envelope latency, minus the tiny Mongo write delay per step."""
    steps = doc.get("steps") or []
    if not steps:
        return None

    start_ts: datetime | None = None
    end_ts: datetime | None = None
    for step in steps:
        ts = _parse_ts(step.get("timestamp"))
        if ts is None:
            continue
        if start_ts is None:
            start_ts = ts
        if step.get("step") == "complete" and step.get("status") == "completed":
            end_ts = ts  # last wins — there should only be one

    if start_ts is None or end_ts is None:
        return None
    delta = (end_ts - start_ts).total_seconds()
    return delta if delta >= 0 else None


def compute_latency_metrics(collection: Any) -> dict[str, Any]:
    """
    Compute p50/p95 latency from the first pipeline step to the terminal
    ``complete`` step for each completed task. Falls back to
    ``updated_at − created_at`` only when step timestamps are unavailable.
    """
    docs = list(collection.find(
        {"status": "completed"},
        {"steps": 1, "created_at": 1, "updated_at": 1},
    ))

    if not docs:
        return {"count": 0, "p50_seconds": None, "p95_seconds": None, "avg_seconds": None}

    step_latencies: list[float] = []
    fallback_latencies: list[float] = []
    for doc in docs:
        lat = _task_pipeline_latency(doc)
        if lat is not None:
            step_latencies.append(lat)
            continue
        created = doc.get("created_at")
        updated = doc.get("updated_at")
        if isinstance(created, datetime) and isinstance(updated, datetime):
            delta = (updated - created).total_seconds()
            if delta >= 0:
                fallback_latencies.append(delta)

    series: list[float]
    if step_latencies:
        series = step_latencies
        source = "pipeline_steps"
    else:
        series = fallback_latencies
        source = "db_timestamps_fallback"

    if not series:
        return {"count": 0, "p50_seconds": None, "p95_seconds": None, "avg_seconds": None}

    arr = np.array(series)
    return {
        "count": len(arr),
        "source": source,
        "tasks_with_step_times": len(step_latencies),
        "tasks_fallback_only": len(fallback_latencies) if source == "db_timestamps_fallback" else 0,
        "p50_seconds": round(float(np.percentile(arr, 50)), 2),
        "p95_seconds": round(float(np.percentile(arr, 95)), 2),
        "avg_seconds": round(float(np.mean(arr)), 2),
        "max_seconds": round(float(np.max(arr)), 2),
    }


def print_section(title: str) -> None:
    width = 60
    print("\n" + "=" * width)
    print(f"  {title}")
    print("=" * width)


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Agent evaluation metrics")
    parser.add_argument("--mongo-uri", default="mongodb://localhost:27017", help="MongoDB URI")
    parser.add_argument("--db", default="linkedinclone", help="MongoDB database name")
    args = parser.parse_args()

    print(f"\nConnecting to MongoDB: {args.mongo_uri} / {args.db}")
    try:
        client = MongoClient(args.mongo_uri, serverSelectionTimeoutMS=3000)
        client.admin.command("ping")
    except Exception as exc:
        print(f"ERROR: Cannot connect to MongoDB: {exc}")
        sys.exit(1)

    collection = client[args.db]["ai_traces"]
    total_tasks = collection.count_documents({})
    print(f"Total ai_traces documents: {total_tasks}")

    # 1. Precision@5
    print_section("1. Matching Quality — Precision@5")
    p5_metrics = compute_precision_at_5(collection)
    for summary in p5_metrics["per_label"]:
        label = summary["label"]
        n = summary["n_tasks"]
        mean = summary["mean_precision_at_5"]
        mean_str = f"{mean:.4f}" if mean is not None else "N/A"
        note = summary.get("note", "")
        print(f"  {label:<30} n={n:<3} mean P@5 = {mean_str}  {note}")

    per_task = p5_metrics["per_task"]
    if per_task:
        print("\n  Per-task detail (most recent first):")
        for row in per_task[:10]:
            print(f"    [{row['label']:<22}] task_id={row['task_id']} P@5={row['precision_at_5']}")
            print(f"        Predicted: {row['predicted_top5']}")
            print(f"        Expected:  {row['expected']}")
        if len(per_task) > 10:
            print(f"    …and {len(per_task) - 10} more task(s)")

    mean_overall = p5_metrics.get("mean_precision_at_5")
    unmatched = p5_metrics.get("tasks_without_label_match", 0)
    print(
        f"\n  Overall Mean Precision@5: "
        f"{mean_overall if mean_overall is not None else 'N/A (no labelled tasks found)'}"
    )
    if unmatched:
        print(f"  Tasks skipped (no labelled-pair overlap ≥ {MIN_LABEL_OVERLAP}): {unmatched}")

    # 2. Approval rate
    print_section("2. Human-in-the-Loop Approval Rate")
    approval = compute_approval_rate(collection)
    print(f"  Total decisions: {approval['total_decisions']}")
    if approval["total_decisions"] == 0:
        print("  No approval decisions recorded yet.")
    else:
        for action, stats in approval["breakdown"].items():
            print(f"  {action:<10} {stats['count']:>5} ({stats['percentage']:.1f}%)")

    # 3. Latency
    print_section("3. End-to-End Latency (first step → complete)")
    latency = compute_latency_metrics(collection)
    if latency["count"] == 0:
        print("  No completed tasks found.")
    else:
        print(f"  Completed tasks: {latency['count']}  (source: {latency.get('source')})")
        if latency.get("source") == "db_timestamps_fallback":
            print("  Warning: step timestamps unavailable — using DB write times.")
        print(f"  p50:  {latency['p50_seconds']}s")
        print(f"  p95:  {latency['p95_seconds']}s")
        print(f"  avg:  {latency['avg_seconds']}s")
        print(f"  max:  {latency['max_seconds']}s")

    print("\n" + "=" * 60)
    print("  Evaluation complete.")
    print("=" * 60 + "\n")
    client.close()


if __name__ == "__main__":
    main()
