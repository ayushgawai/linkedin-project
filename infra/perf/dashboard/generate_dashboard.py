#!/usr/bin/env python3
"""Generate the 7 analytics dashboard chart PNGs required by the report.

Mirrors the aggregations already served by services/analytics/src/routes/analytics.js
so the same data points that power the live dashboard also power the screenshots.

Usage
-----
    # Live stack available (docker compose up, seeder already run):
    python3 infra/perf/dashboard/generate_dashboard.py

    # No stack yet — produce realistic sample charts from synthetic data:
    python3 infra/perf/dashboard/generate_dashboard.py --source=demo

    # Custom output dir / window size:
    python3 infra/perf/dashboard/generate_dashboard.py --out=/tmp/charts --window=60

Requires
--------
    pip3 install matplotlib pymongo pymysql

The 7 charts produced
---------------------
    01_top_jobs_by_applications.png
    02_top_jobs_by_views.png
    03_application_funnel.png
    04_applicant_geography.png
    05_events_per_day_timeline.png
    06_event_type_mix.png
    07_member_dashboard.png           (two-panel figure)
"""

import argparse
import os
import random
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:
    print("[dashboard] ERROR: matplotlib required. pip3 install matplotlib", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# CLI + defaults
# ---------------------------------------------------------------------------
def parse_args():
    p = argparse.ArgumentParser(description="Generate analytics dashboard PNGs.")
    p.add_argument("--source", choices=["db", "demo"], default="db",
                   help="db = real MySQL+Mongo; demo = synthetic data (default: db)")
    p.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "charts"),
                   help="output directory (default: ./charts)")
    p.add_argument("--window", type=int, default=30,
                   help="analytics window in days (default: 30)")
    p.add_argument("--mysql-host", default=os.getenv("DB_HOST", "localhost"))
    p.add_argument("--mysql-port", type=int, default=int(os.getenv("DB_PORT", "3306")))
    p.add_argument("--mysql-user", default=os.getenv("DB_USER", "root"))
    p.add_argument("--mysql-pass", default=os.getenv("DB_PASS", "linkedin"))
    p.add_argument("--mysql-db", default=os.getenv("DB_NAME", "linkedinclone"))
    p.add_argument("--mongo-uri", default=os.getenv("MONGO_URI", "mongodb://localhost:27017"))
    p.add_argument("--mongo-db", default=os.getenv("MONGO_DB", "linkedinclone"))
    return p.parse_args()


# ---------------------------------------------------------------------------
# Data sources — each returns a dict the render_* functions consume.
# ---------------------------------------------------------------------------
def load_from_db(args):
    try:
        import pymongo
        import pymysql
    except ImportError:
        print("[dashboard] ERROR: pymongo + pymysql required for --source=db.", file=sys.stderr)
        print("             Either install them or re-run with --source=demo.", file=sys.stderr)
        sys.exit(1)

    print(f"[dashboard] connecting to MySQL {args.mysql_host}:{args.mysql_port}/{args.mysql_db}")
    mysql = pymysql.connect(
        host=args.mysql_host, port=args.mysql_port,
        user=args.mysql_user, password=args.mysql_pass,
        database=args.mysql_db, cursorclass=pymysql.cursors.DictCursor,
    )
    print(f"[dashboard] connecting to Mongo {args.mongo_uri}/{args.mongo_db}")
    mongo = pymongo.MongoClient(args.mongo_uri)[args.mongo_db]

    since_iso = (datetime.now(timezone.utc) - timedelta(days=args.window)).isoformat()
    since_dt = datetime.now(timezone.utc) - timedelta(days=args.window)

    # Chart 1 + 2: top jobs by {applications, views}
    top_apps = _top_jobs(mongo, mysql, "application.submitted", since_iso, limit=10)
    top_views = _top_jobs(mongo, mysql, "job.viewed", since_iso, limit=10)

    # Chart 3 + 4: funnel + geo for the #1 job by applications
    focus_job_id = top_apps[0]["job_id"] if top_apps else None
    focus_job_title = top_apps[0]["title"] if top_apps else "(no data)"
    funnel = _funnel(mongo, focus_job_id, since_iso) if focus_job_id else _empty_funnel()
    geo = _geo(mongo, focus_job_id, since_iso) if focus_job_id else []

    # Chart 5 + 6: timeline + overall mix
    timeline = _event_timeline(mongo, since_iso)
    mix = _event_mix(mongo, since_iso)

    # Chart 7: sample member dashboard — pick a member with many profile_views
    focus_member = _pick_busy_member(mongo)
    views_ts = _member_profile_views(mongo, focus_member, since_dt) if focus_member else []
    app_status = _member_application_status(mysql, focus_member) if focus_member else {}

    mysql.close()

    return {
        "window_days": args.window,
        "top_apps": top_apps,
        "top_views": top_views,
        "focus_job": {"id": focus_job_id, "title": focus_job_title},
        "funnel": funnel,
        "geo": geo,
        "timeline": timeline,
        "event_mix": mix,
        "focus_member": focus_member,
        "member_profile_views": views_ts,
        "member_application_status": app_status,
    }


def _top_jobs(mongo, mysql, event_type, since_iso, limit):
    pipeline = [
        {"$match": {
            "event_type": event_type,
            "entity.entity_type": "job",
            "timestamp": {"$gte": since_iso},
        }},
        {"$group": {"_id": "$entity.entity_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": limit},
    ]
    agg = list(mongo["events"].aggregate(pipeline))
    job_ids = [r["_id"] for r in agg if r["_id"]]
    title_map = {}
    if job_ids:
        with mysql.cursor() as c:
            fmt = ",".join(["%s"] * len(job_ids))
            c.execute(
                f"""SELECT j.job_id, j.title, r.company_name
                      FROM jobs j
                      LEFT JOIN recruiters r ON r.recruiter_id = j.recruiter_id
                      WHERE j.job_id IN ({fmt})""",
                job_ids,
            )
            for row in c.fetchall():
                title_map[row["job_id"]] = (row["title"], row["company_name"])
    out = []
    for r in agg:
        title, company = title_map.get(r["_id"], (None, None))
        out.append({"job_id": r["_id"], "count": r["count"],
                    "title": title or r["_id"][:8], "company": company or ""})
    return out


def _empty_funnel():
    return {"view": 0, "save": 0, "apply_start": 0, "submit": 0}


def _funnel(mongo, job_id, since_iso):
    pipeline = [
        {"$match": {
            "entity.entity_type": "job",
            "entity.entity_id": job_id,
            "event_type": {"$in": ["job.viewed", "job.saved", "apply_start", "application.submitted"]},
            "timestamp": {"$gte": since_iso},
        }},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
    ]
    rows = {r["_id"]: r["count"] for r in mongo["events"].aggregate(pipeline)}
    return {
        "view": rows.get("job.viewed", 0),
        "save": rows.get("job.saved", 0),
        "apply_start": rows.get("apply_start", 0),
        "submit": rows.get("application.submitted", 0),
    }


def _geo(mongo, job_id, since_iso, limit=15):
    pipeline = [
        {"$match": {
            "event_type": "application.submitted",
            "entity.entity_type": "job",
            "entity.entity_id": job_id,
            "timestamp": {"$gte": since_iso},
        }},
        {"$group": {
            "_id": {
                "city": {"$ifNull": ["$payload.member_city", "$payload.city"]},
                "state": {"$ifNull": ["$payload.member_state", "$payload.state"]},
            },
            "count": {"$sum": 1},
        }},
        {"$match": {"_id.city": {"$ne": None}}},
        {"$sort": {"count": -1}},
        {"$limit": limit},
    ]
    out = []
    for r in mongo["events"].aggregate(pipeline):
        out.append({"city": r["_id"]["city"], "state": r["_id"]["state"], "count": r["count"]})
    return out


def _event_timeline(mongo, since_iso):
    pipeline = [
        {"$match": {"timestamp": {"$gte": since_iso}}},
        {"$group": {
            "_id": {
                "date": {"$substr": ["$timestamp", 0, 10]},
                "event_type": "$event_type",
            },
            "count": {"$sum": 1},
        }},
    ]
    buckets = defaultdict(lambda: defaultdict(int))  # {date: {event_type: count}}
    for r in mongo["events"].aggregate(pipeline):
        buckets[r["_id"]["date"]][r["_id"]["event_type"]] = r["count"]
    return dict(buckets)


def _event_mix(mongo, since_iso):
    pipeline = [
        {"$match": {"timestamp": {"$gte": since_iso}}},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    return [(r["_id"], r["count"]) for r in mongo["events"].aggregate(pipeline)]


def _pick_busy_member(mongo):
    pipeline = [
        {"$group": {"_id": "$member_id", "c": {"$sum": 1}}},
        {"$sort": {"c": -1}},
        {"$limit": 1},
    ]
    for r in mongo["profile_views"].aggregate(pipeline):
        return r["_id"]
    return None


def _member_profile_views(mongo, member_id, since_dt):
    pipeline = [
        {"$match": {"member_id": member_id, "viewed_at": {"$gte": since_dt}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$viewed_at"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    return [(r["_id"], r["count"]) for r in mongo["profile_views"].aggregate(pipeline)]


def _member_application_status(mysql, member_id):
    with mysql.cursor() as c:
        c.execute(
            "SELECT status, COUNT(*) AS count FROM applications WHERE member_id = %s GROUP BY status",
            (member_id,),
        )
        return {r["status"]: int(r["count"]) for r in c.fetchall()}


# ---------------------------------------------------------------------------
# Demo data — realistic synthetic values for offline chart generation.
# Every random draw is seeded so regen is deterministic.
# ---------------------------------------------------------------------------
def load_demo(args):
    rng = random.Random(42)
    today = datetime.now(timezone.utc).date()

    companies = ["Acme", "Globex", "Initech", "Umbrella", "Stark", "Wayne",
                 "Hooli", "Pied Piper", "Vandelay", "Soylent"]
    titles = ["Senior Backend Engineer", "Staff ML Engineer", "Frontend Lead",
              "Platform SRE", "Data Engineer III", "Engineering Manager",
              "Principal Architect", "DevOps Engineer", "Full-Stack Developer",
              "Security Engineer"]

    def top_jobs(scale):
        rows = []
        base = rng.randint(int(800 * scale), int(1200 * scale))
        for i in range(10):
            decay = 0.85 ** i
            rows.append({
                "job_id": f"job-demo-{i+1:02d}",
                "title": titles[i],
                "company": companies[i],
                "count": int(base * decay * rng.uniform(0.9, 1.1)),
            })
        return rows

    top_apps = top_jobs(scale=1.0)
    top_views = top_jobs(scale=6.0)

    funnel = {"view": top_views[0]["count"]}
    funnel["save"] = int(funnel["view"] * 0.22)
    funnel["apply_start"] = int(funnel["view"] * 0.09)
    funnel["submit"] = int(funnel["view"] * 0.05)

    cities = [
        ("San Francisco", "CA"), ("New York", "NY"), ("Seattle", "WA"),
        ("Austin", "TX"), ("Boston", "MA"), ("Chicago", "IL"),
        ("Los Angeles", "CA"), ("Denver", "CO"), ("Atlanta", "GA"),
        ("Portland", "OR"), ("Raleigh", "NC"), ("Miami", "FL"),
    ]
    geo_total = funnel["submit"]
    geo = []
    remaining = geo_total
    for i, (city, state) in enumerate(cities):
        share = rng.uniform(0.05, 0.22) if i < len(cities) - 1 else 1.0
        n = min(remaining, max(1, int(geo_total * share)))
        geo.append({"city": city, "state": state, "count": n})
        remaining -= n
        if remaining <= 0:
            break
    geo.sort(key=lambda r: r["count"], reverse=True)

    event_types = ["job.viewed", "job.saved", "apply_start",
                   "application.submitted", "connection.accepted",
                   "connection.requested", "message.sent"]
    weights = [40, 15, 8, 10, 10, 10, 7]

    timeline = {}
    for d in range(args.window):
        date = (today - timedelta(days=args.window - 1 - d)).isoformat()
        day_scale = 1.0 + 0.4 * ((d / args.window) - 0.5)  # slight trend
        buckets = {}
        for ev, w in zip(event_types, weights):
            buckets[ev] = int(w * 120 * day_scale * rng.uniform(0.7, 1.3))
        timeline[date] = buckets

    mix = Counter()
    for day in timeline.values():
        for k, v in day.items():
            mix[k] += v
    event_mix = mix.most_common()

    member_profile_views = []
    for d in range(args.window):
        date = (today - timedelta(days=args.window - 1 - d)).isoformat()
        member_profile_views.append((date, rng.randint(5, 45)))

    member_app_status = {
        "submitted": rng.randint(8, 25),
        "under_review": rng.randint(3, 10),
        "interview": rng.randint(1, 6),
        "offer": rng.randint(0, 2),
        "rejected": rng.randint(2, 12),
        "withdrawn": rng.randint(0, 3),
    }

    return {
        "window_days": args.window,
        "top_apps": top_apps,
        "top_views": top_views,
        "focus_job": {"id": "job-demo-01", "title": titles[0]},
        "funnel": funnel,
        "geo": geo,
        "timeline": timeline,
        "event_mix": event_mix,
        "focus_member": "member-demo-001",
        "member_profile_views": member_profile_views,
        "member_application_status": member_app_status,
    }


# ---------------------------------------------------------------------------
# Renderers — one per PNG. Matplotlib, no plotly/seaborn to keep deps minimal.
# ---------------------------------------------------------------------------
PALETTE = ["#1e88e5", "#43a047", "#f4511e", "#8e24aa", "#fb8c00",
           "#00897b", "#c62828", "#3949ab", "#7cb342", "#6d4c41"]


def _horizontal_bar(ax, labels, values, color, xlabel, title):
    y = list(range(len(labels)))
    ax.barh(y, values, color=color)
    ax.set_yticks(y)
    ax.set_yticklabels(labels)
    ax.invert_yaxis()
    ax.set_xlabel(xlabel)
    ax.set_title(title)
    ax.grid(axis="x", linestyle="--", alpha=0.4)
    for i, v in enumerate(values):
        ax.text(v, i, f" {v:,}", va="center", fontsize=9)


def chart_top_apps(data, out):
    rows = data["top_apps"][:10]
    if not rows:
        return _empty_placeholder(out, "01_top_jobs_by_applications.png", "No application events in window")
    labels = [f"{r['title'][:28]}\n{r['company']}" if r["company"] else r["title"][:32] for r in rows]
    values = [r["count"] for r in rows]
    fig, ax = plt.subplots(figsize=(10, 6))
    _horizontal_bar(ax, labels, values, PALETTE[0], "Applications",
                    f"Top 10 jobs by applications — last {data['window_days']} days")
    fig.tight_layout()
    fig.savefig(os.path.join(out, "01_top_jobs_by_applications.png"), dpi=130)
    plt.close(fig)


def chart_top_views(data, out):
    rows = data["top_views"][:10]
    if not rows:
        return _empty_placeholder(out, "02_top_jobs_by_views.png", "No view events in window")
    labels = [f"{r['title'][:28]}\n{r['company']}" if r["company"] else r["title"][:32] for r in rows]
    values = [r["count"] for r in rows]
    fig, ax = plt.subplots(figsize=(10, 6))
    _horizontal_bar(ax, labels, values, PALETTE[1], "Views",
                    f"Top 10 jobs by views — last {data['window_days']} days")
    fig.tight_layout()
    fig.savefig(os.path.join(out, "02_top_jobs_by_views.png"), dpi=130)
    plt.close(fig)


def chart_funnel(data, out):
    f = data["funnel"]
    stages = [("Viewed", f["view"]), ("Saved", f["save"]),
              ("Apply started", f["apply_start"]), ("Submitted", f["submit"])]
    labels = [s[0] for s in stages]
    values = [s[1] for s in stages]
    job_title = data["focus_job"]["title"]

    fig, ax = plt.subplots(figsize=(9, 5.5))
    bars = ax.bar(labels, values, color=PALETTE[2])
    ax.set_ylabel("Event count")
    ax.set_title(f"Application funnel — {job_title[:40]}\nwindow: {data['window_days']} days")
    ax.grid(axis="y", linestyle="--", alpha=0.4)

    top_val = max(values) if any(values) else 1
    for bar, v in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, v, f"{v:,}",
                ha="center", va="bottom", fontsize=10)
    # Add conversion-rate annotations between stages
    for i in range(len(values) - 1):
        num, den = values[i + 1], values[i]
        pct = (num / den * 100) if den > 0 else 0
        ax.annotate(f"→ {pct:.1f}%", xy=(i + 0.5, top_val * 0.05),
                    ha="center", fontsize=9, color="#555")
    fig.tight_layout()
    fig.savefig(os.path.join(out, "03_application_funnel.png"), dpi=130)
    plt.close(fig)


def chart_geo(data, out):
    rows = data["geo"][:12]
    if not rows:
        return _empty_placeholder(out, "04_applicant_geography.png",
                                  "No geo-tagged applications for focus job")
    labels = [f"{r['city']}, {r['state']}" for r in rows]
    values = [r["count"] for r in rows]
    fig, ax = plt.subplots(figsize=(9, 6))
    _horizontal_bar(ax, labels, values, PALETTE[3], "Applications",
                    f"Applicant geography — {data['focus_job']['title'][:40]}")
    fig.tight_layout()
    fig.savefig(os.path.join(out, "04_applicant_geography.png"), dpi=130)
    plt.close(fig)


def chart_timeline(data, out):
    timeline = data["timeline"]
    if not timeline:
        return _empty_placeholder(out, "05_events_per_day_timeline.png", "No events in window")
    dates = sorted(timeline.keys())
    event_types = sorted({et for day in timeline.values() for et in day.keys()})

    fig, ax = plt.subplots(figsize=(12, 6))
    bottom = [0] * len(dates)
    for i, ev in enumerate(event_types):
        values = [timeline[d].get(ev, 0) for d in dates]
        ax.bar(dates, values, bottom=bottom, label=ev, color=PALETTE[i % len(PALETTE)])
        bottom = [b + v for b, v in zip(bottom, values)]
    ax.set_xlabel("Date")
    ax.set_ylabel("Events")
    ax.set_title(f"Events per day by type — last {data['window_days']} days")
    ax.legend(loc="upper left", fontsize=8, ncol=2)
    # Thin x labels if too many dates
    step = max(1, len(dates) // 10)
    ax.set_xticks(dates[::step])
    ax.set_xticklabels(dates[::step], rotation=35, ha="right")
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    fig.tight_layout()
    fig.savefig(os.path.join(out, "05_events_per_day_timeline.png"), dpi=130)
    plt.close(fig)


def chart_event_mix(data, out):
    mix = data["event_mix"]
    if not mix:
        return _empty_placeholder(out, "06_event_type_mix.png", "No events in window")
    labels = [m[0] for m in mix]
    values = [m[1] for m in mix]
    fig, ax = plt.subplots(figsize=(8, 8))
    wedges, _, autotexts = ax.pie(
        values, labels=labels, autopct=lambda p: f"{p:.1f}%",
        colors=PALETTE[: len(labels)], startangle=90,
        wedgeprops=dict(width=0.45, edgecolor="white"),
    )
    ax.set_title(f"Event type mix — last {data['window_days']} days\n(total: {sum(values):,} events)")
    for t in autotexts:
        t.set_color("white")
        t.set_fontsize(9)
    fig.tight_layout()
    fig.savefig(os.path.join(out, "06_event_type_mix.png"), dpi=130)
    plt.close(fig)


def chart_member_dashboard(data, out):
    views = data["member_profile_views"]
    status = data["member_application_status"]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5.5))

    if views:
        dates = [v[0] for v in views]
        counts = [v[1] for v in views]
        ax1.plot(dates, counts, marker="o", color=PALETTE[0], linewidth=2, markersize=4)
        ax1.fill_between(dates, counts, alpha=0.15, color=PALETTE[0])
        ax1.set_title(f"Profile views — last {data['window_days']} days")
        ax1.set_ylabel("Views / day")
        step = max(1, len(dates) // 8)
        ax1.set_xticks(dates[::step])
        ax1.set_xticklabels(dates[::step], rotation=35, ha="right", fontsize=8)
        ax1.grid(linestyle="--", alpha=0.4)
    else:
        ax1.text(0.5, 0.5, "No profile views in window", ha="center", va="center")
        ax1.set_axis_off()

    if status:
        ax2.pie(status.values(), labels=status.keys(),
                autopct=lambda p: f"{p:.0f}%",
                colors=PALETTE[: len(status)], startangle=90,
                wedgeprops=dict(width=0.4, edgecolor="white"))
        ax2.set_title("Application status breakdown")
    else:
        ax2.text(0.5, 0.5, "No applications submitted", ha="center", va="center")
        ax2.set_axis_off()

    member = data.get("focus_member") or "(sample member)"
    fig.suptitle(f"Member dashboard — {member}", fontsize=13, y=1.02)
    fig.tight_layout()
    fig.savefig(os.path.join(out, "07_member_dashboard.png"), dpi=130, bbox_inches="tight")
    plt.close(fig)


def _empty_placeholder(out, fname, message):
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.text(0.5, 0.5, message, ha="center", va="center", fontsize=14, color="#888")
    ax.set_axis_off()
    fig.tight_layout()
    fig.savefig(os.path.join(out, fname), dpi=120)
    plt.close(fig)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    args = parse_args()
    os.makedirs(args.out, exist_ok=True)

    if args.source == "db":
        data = load_from_db(args)
    else:
        print("[dashboard] using demo data (no DB required)")
        data = load_demo(args)

    print(f"[dashboard] writing PNGs to {args.out}")
    chart_top_apps(data, args.out)
    chart_top_views(data, args.out)
    chart_funnel(data, args.out)
    chart_geo(data, args.out)
    chart_timeline(data, args.out)
    chart_event_mix(data, args.out)
    chart_member_dashboard(data, args.out)

    produced = sorted(f for f in os.listdir(args.out) if f.endswith(".png"))
    print(f"[dashboard] done — {len(produced)} PNGs:")
    for f in produced:
        print(f"    {os.path.join(args.out, f)}")


if __name__ == "__main__":
    main()
