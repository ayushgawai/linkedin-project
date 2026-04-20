#!/usr/bin/env python3
"""
transform.py — Transform raw Kaggle CSVs into seed JSON files.

Reads from:  data/raw/
Writes to:   data/seeds/

Targets: 10K members, 10K recruiters, 10K jobs, ~50K applications,
         100K+ MongoDB events.

Usage:
    python3 data/transform.py
"""

import json
import re
import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
from faker import Faker

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE  = Path(__file__).parent
RAW   = BASE / "raw"
SEEDS = BASE / "seeds"
SEEDS.mkdir(exist_ok=True)

# ── RNG seeds (reproducible output) ───────────────────────────────────────────
random.seed(42)
Faker.seed(42)
fake = Faker()

# ── Volume targets ─────────────────────────────────────────────────────────────
N_MEMBERS     = 10_000
N_RECRUITERS  = 10_000
N_JOBS        = 10_000
N_APPLICATIONS = 50_000
N_EVENTS      = 100_000

# ── Field-value mappings ───────────────────────────────────────────────────────
SENIORITY_MAP = {
    "Internship":       "internship",
    "Entry level":      "entry",
    "Associate":        "associate",
    "Mid-Senior level": "mid",
    "Senior":           "senior",
    "Director":         "director",
    "Executive":        "executive",
}

WORK_TYPE_MAP = {
    "Full-time":  "full_time",
    "Part-time":  "part_time",
    "Contract":   "contract",
    "Temporary":  "temporary",
    "Volunteer":  "volunteer",
    "Internship": "internship",
    # "Other" intentionally omitted — rows with Other get Faker-generated type
}

# Keys match the ALL-CAPS categories in Resume.csv exactly
CATEGORY_SKILLS = {
    "HR":                   ["Recruitment", "HRIS", "Onboarding", "Employee Relations",
                             "Performance Management", "Payroll", "Talent Acquisition"],
    "DESIGNER":             ["Photoshop", "Illustrator", "UI/UX Design", "Figma",
                             "Sketch", "Adobe XD", "Wireframing"],
    "INFORMATION-TECHNOLOGY": ["Python", "Java", "SQL", "Linux", "AWS",
                               "Docker", "Kubernetes", "Git"],
    "TEACHER":              ["Curriculum Development", "Classroom Management",
                             "E-Learning", "Mentoring", "Lesson Planning"],
    "ADVOCATE":             ["Legal Research", "Communication", "Negotiation",
                             "Contract Law", "Litigation"],
    "BUSINESS-DEVELOPMENT": ["Sales", "CRM", "Lead Generation",
                             "Market Research", "Negotiation", "Salesforce"],
    "HEALTHCARE":           ["Patient Care", "EMR", "HIPAA", "Clinical Documentation",
                             "CPR", "Medical Coding"],
    "FITNESS":              ["Personal Training", "Nutrition", "Exercise Science", "CPR"],
    "AGRICULTURE":          ["Agronomy", "Crop Management", "Soil Science", "GIS"],
    "BPO":                  ["Customer Service", "Data Entry", "CRM", "Call Center", "Zendesk"],
    "SALES":                ["Salesforce", "Lead Generation", "Cold Calling", "CRM",
                             "Negotiation", "Account Management"],
    "CONSULTANT":           ["Business Analysis", "Project Management", "Strategy",
                             "Stakeholder Management", "PowerPoint"],
    "DIGITAL-MEDIA":        ["SEO", "Content Marketing", "Social Media",
                             "Google Analytics", "Copywriting"],
    "AUTOMOBILE":           ["AutoCAD", "Mechanical Engineering", "Quality Control",
                             "Six Sigma"],
    "CHEF":                 ["Food Safety", "Menu Planning", "Kitchen Management",
                             "Culinary Arts", "HACCP"],
    "FINANCE":              ["Excel", "Financial Modeling", "Accounting",
                             "Bloomberg", "QuickBooks", "FP&A"],
    "APPAREL":              ["Fashion Design", "Merchandising", "Textile", "Retail",
                             "Visual Merchandising"],
    "ENGINEERING":          ["CAD", "Python", "MATLAB", "Project Management",
                             "AutoCAD", "SolidWorks"],
    "ACCOUNTANT":           ["GAAP", "QuickBooks", "Excel", "Tax Preparation",
                             "Auditing", "SAP"],
    "CONSTRUCTION":         ["AutoCAD", "Project Management", "Safety Compliance",
                             "Estimating", "OSHA"],
    "PUBLIC-RELATIONS":     ["Media Relations", "Press Releases",
                             "Crisis Management", "Social Media", "Cision"],
    "BANKING":              ["Financial Analysis", "Risk Management", "AML",
                             "Excel", "Bloomberg", "KYC"],
    "ARTS":                 ["Adobe Creative Suite", "Illustration", "Photography",
                             "Art Direction", "Procreate"],
    "AVIATION":             ["FAA Regulations", "Navigation", "Safety Management",
                             "Flight Planning"],
}

GENERAL_SKILLS = [
    "Communication", "Teamwork", "Problem Solving", "Leadership",
    "Microsoft Office", "Project Management", "Data Analysis",
    "Python", "SQL", "Excel", "Time Management", "Critical Thinking",
]

UNIVERSITIES = [
    "Stanford University", "MIT", "UC Berkeley", "Carnegie Mellon",
    "Georgia Tech", "University of Michigan", "UCLA",
    "University of Washington", "UT Austin", "Purdue University",
    "Ohio State University", "Penn State", "Arizona State University",
    "University of Illinois", "University of Florida",
    "Boston University", "Northeastern University", "NYU",
    "University of Southern California", "University of Minnesota",
]

DEGREES = [
    "Bachelor of Science", "Bachelor of Arts", "Master of Science",
    "Master of Arts", "MBA", "Associate's Degree", "PhD",
]


# ══════════════════════════════════════════════════════════════════════════════
# CLEANING HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def clean_text(val) -> str:
    """Strip, collapse whitespace and remove non-printable control characters."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val)
    # Remove non-printable chars except newline and tab
    s = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', s)
    # Collapse runs of whitespace (spaces/tabs) to a single space
    s = re.sub(r'[ \t]+', ' ', s)
    # Collapse 3+ newlines to at most 2
    s = re.sub(r'\n{3,}', '\n\n', s)
    return s.strip()


def clean_resume(val) -> str:
    """Extra cleaning for resume text: also collapse multiple spaces mid-sentence."""
    s = clean_text(val)
    # Resumes have patterns like "company       Summary    text" — collapse them
    s = re.sub(r' {2,}', ' ', s)
    return s


def safe_str(val, maxlen: int = None, default: str = "") -> str:
    s = clean_text(val) or default
    return s[:maxlen] if maxlen else s


def safe_int(val, default: int = 0) -> int:
    try:
        v = float(val)
        return default if pd.isna(v) else int(v)
    except Exception:
        return default


def new_uuid() -> str:
    return str(uuid.uuid4())


def fmt_dt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def rand_dt(start: datetime, end: datetime) -> datetime:
    delta = int((end - start).total_seconds())
    return start + timedelta(seconds=random.randint(0, max(delta, 1)))


def skills_for_category(category: str, n: int) -> list:
    """category must already be the raw ALL-CAPS string from Resume.csv."""
    pool = list(set(CATEGORY_SKILLS.get(category.upper(), []) + GENERAL_SKILLS))
    return random.sample(pool, min(n, len(pool)))


def parse_salary(min_sal, max_sal, pay_period) -> str:
    """Convert any pay period to an annual salary range string."""
    try:
        lo = float(min_sal)
        hi = float(max_sal)
        if pd.isna(lo) or pd.isna(hi) or lo <= 0 or hi <= 0:
            raise ValueError("missing or zero salary")
        if lo > hi:
            lo, hi = hi, lo   # swap if inverted

        period = safe_str(pay_period).upper()
        if period == "HOURLY":
            lo, hi = lo * 2_080, hi * 2_080   # 52 weeks × 40 hrs
        elif period in ("MONTHLY", "MONTH"):
            lo, hi = lo * 12, hi * 12

        # Sanity: if annualised salary looks unreasonable, regenerate
        if lo < 20_000 or hi > 1_000_000:
            raise ValueError(f"salary out of range: {lo}-{hi}")

        return f"${int(lo):,} - ${int(hi):,}"
    except Exception:
        lo = random.randint(60, 160) * 1_000
        hi = lo + random.randint(10, 50) * 1_000
        return f"${lo:,} - ${hi:,}"


def ts_to_dt(ts_ms) -> str:
    try:
        return fmt_dt(datetime.fromtimestamp(float(ts_ms) / 1_000))
    except Exception:
        return fmt_dt(fake.date_time_between(start_date="-2y", end_date="now"))


# ══════════════════════════════════════════════════════════════════════════════
# LOAD & CLEAN RAW CSVs
# ══════════════════════════════════════════════════════════════════════════════
print("=" * 60)
print("Loading and cleaning raw CSVs...")
print("=" * 60)

# ── Job postings ───────────────────────────────────────────────────────────────
jobs_df = pd.read_csv(RAW / "job_postings.csv", low_memory=False)
print(f"  job_postings raw          : {len(jobs_df):>7,} rows")

jobs_df = jobs_df.dropna(subset=["title", "description"])
jobs_df["title"]       = jobs_df["title"].apply(clean_text)
jobs_df["description"] = jobs_df["description"].apply(clean_text)
jobs_df["location"]    = jobs_df["location"].apply(clean_text)

# Drop blank titles/descriptions after cleaning
jobs_df = jobs_df[jobs_df["title"].str.strip() != ""]
jobs_df = jobs_df[jobs_df["description"].str.strip() != ""]

# Drop duplicate descriptions (exact copy-paste jobs)
jobs_df = jobs_df.drop_duplicates(subset=["description"])
# Drop duplicate title+location combos
jobs_df = jobs_df.drop_duplicates(subset=["title", "location"])

print(f"  job_postings after dedup  : {len(jobs_df):>7,} rows")

# ── Companies ──────────────────────────────────────────────────────────────────
companies_df = pd.read_csv(RAW / "companies.csv", low_memory=False)
print(f"  companies raw             : {len(companies_df):>7,} rows")

companies_df = companies_df.dropna(subset=["name"])
companies_df["name"] = companies_df["name"].apply(clean_text)
companies_df = companies_df[companies_df["name"].str.strip() != ""]
companies_df = companies_df.drop_duplicates(subset=["name"])   # remove 37 dupes

print(f"  companies after dedup     : {len(companies_df):>7,} rows")

# ── Resumes ────────────────────────────────────────────────────────────────────
resumes_df = pd.read_csv(RAW / "Resume" / "Resume.csv", low_memory=False)
print(f"  resumes raw               : {len(resumes_df):>7,} rows")

resumes_df = resumes_df.dropna(subset=["Resume_str"])
resumes_df["Resume_str"] = resumes_df["Resume_str"].apply(clean_resume)
resumes_df["Category"]   = resumes_df["Category"].str.strip().str.upper()

# Drop duplicate resume texts
resumes_df = resumes_df.drop_duplicates(subset=["Resume_str"])
resumes_df = resumes_df[resumes_df["Resume_str"].str.len() > 50]  # drop near-empty

print(f"  resumes after dedup/clean : {len(resumes_df):>7,} rows")


# ══════════════════════════════════════════════════════════════════════════════
# 1. RECRUITERS  (from companies)
# ══════════════════════════════════════════════════════════════════════════════
print("\n[1/7] Building recruiters...")

SIZE_MAP = {
    "1": "1-10", "2": "11-50", "3": "51-200", "4": "201-500",
    "5": "501-1000", "6": "1001-5000", "7": "5001-10000", "8": "10001+",
}

n_comp = min(N_RECRUITERS, len(companies_df))
companies_sample = companies_df.sample(n=n_comp, random_state=42).reset_index(drop=True)

recruiters = []
recruiter_company_pairs = []

for _, row in companies_sample.iterrows():
    rid = new_uuid()
    cid = new_uuid()

    size_raw = str(int(row["company_size"])) if pd.notna(row.get("company_size")) else ""
    company_size = SIZE_MAP.get(size_raw, "51-200")

    loc_parts = [safe_str(row.get(c)) for c in ("city", "state", "country")]
    company_location = ", ".join(p for p in loc_parts if p)[:255] or fake.city()

    recruiters.append({
        "recruiter_id":    rid,
        "company_id":      cid,
        "name":            fake.name()[:200],
        "email":           fake.unique.email()[:255],
        "phone":           fake.phone_number()[:20],
        "company_name":    safe_str(row["name"], maxlen=300),
        "company_industry": fake.bs()[:200],
        "company_size":    company_size[:100],
        "role":            "recruiter",
        "access_level":    "recruiter",
        "created_at":      fmt_dt(fake.date_time_between(start_date="-2y", end_date="now")),
    })
    recruiter_company_pairs.append((rid, cid))

# Pad to N_RECRUITERS
while len(recruiters) < N_RECRUITERS:
    rid, cid = new_uuid(), new_uuid()
    recruiters.append({
        "recruiter_id":    rid,
        "company_id":      cid,
        "name":            fake.name()[:200],
        "email":           fake.unique.email()[:255],
        "phone":           fake.phone_number()[:20],
        "company_name":    fake.company()[:300],
        "company_industry": fake.bs()[:200],
        "company_size":    random.choice(["1-10", "11-50", "51-200", "201-500"]),
        "role":            "recruiter",
        "access_level":    "recruiter",
        "created_at":      fmt_dt(fake.date_time_between(start_date="-2y", end_date="now")),
    })
    recruiter_company_pairs.append((rid, cid))

print(f"  Generated {len(recruiters):,} recruiters")


# ══════════════════════════════════════════════════════════════════════════════
# 2. MEMBERS  (from resumes)
# ══════════════════════════════════════════════════════════════════════════════
print("\n[2/7] Building members + skills + experience + education...")

n_res = min(N_MEMBERS, len(resumes_df))
resumes_sample = resumes_df.sample(n=n_res, random_state=42).reset_index(drop=True)

START_3Y = datetime(2022, 1, 1)
NOW      = datetime(2025, 4, 1)

members          = []
member_ids       = []
member_skills    = []
member_experience = []
member_education = []
member_resume_map = {}

for _, row in resumes_sample.iterrows():
    mid      = new_uuid()
    category = str(row.get("Category", "INFORMATION-TECHNOLOGY")).upper()
    resume_text = safe_str(row.get("Resume_str"), maxlen=8000)

    members.append({
        "member_id":         mid,
        "first_name":        fake.first_name()[:100],
        "last_name":         fake.last_name()[:100],
        "email":             fake.unique.email()[:255],
        "phone":             fake.phone_number()[:20],
        "location":          f"{fake.city()}, {fake.state_abbr()}"[:255],
        "headline":          fake.job()[:500],
        "about":             " ".join(fake.paragraphs(nb=2))[:2000],
        "profile_photo_url": None,
        "connections_count": random.randint(0, 500),
        "created_at":        fmt_dt(rand_dt(START_3Y, NOW)),
        "updated_at":        fmt_dt(rand_dt(START_3Y, NOW)),
    })
    member_ids.append(mid)
    member_resume_map[mid] = resume_text

    # Skills — now correctly keyed to ALL-CAPS category
    for sk in skills_for_category(category, random.randint(3, 7)):
        member_skills.append({"member_id": mid, "skill": sk[:200]})

    # Experience (1–3 positions)
    for _ in range(random.randint(1, 3)):
        sy = random.randint(2010, 2021)
        ey = random.randint(sy + 1, 2024)
        is_cur = random.random() < 0.25
        member_experience.append({
            "exp_id":      new_uuid(),
            "member_id":   mid,
            "company":     fake.company()[:300],
            "title":       fake.job()[:300],
            "start_date":  f"{sy}-{random.randint(1, 12):02d}-01",
            "end_date":    None if is_cur else f"{ey}-{random.randint(1, 12):02d}-01",
            "description": fake.paragraph(nb_sentences=2)[:1000],
            "is_current":  is_cur,
        })

    # Education (1–2)
    for _ in range(random.randint(1, 2)):
        sy = random.randint(2005, 2018)
        member_education.append({
            "edu_id":      new_uuid(),
            "member_id":   mid,
            "institution": random.choice(UNIVERSITIES)[:300],
            "degree":      random.choice(DEGREES)[:200],
            "field":       category.replace("-", " ").title()[:200],
            "start_year":  sy,
            "end_year":    sy + random.randint(2, 4),
        })

# Pad to N_MEMBERS
while len(members) < N_MEMBERS:
    mid = new_uuid()
    members.append({
        "member_id":         mid,
        "first_name":        fake.first_name()[:100],
        "last_name":         fake.last_name()[:100],
        "email":             fake.unique.email()[:255],
        "phone":             fake.phone_number()[:20],
        "location":          f"{fake.city()}, {fake.state_abbr()}"[:255],
        "headline":          fake.job()[:500],
        "about":             " ".join(fake.paragraphs(nb=2))[:2000],
        "profile_photo_url": None,
        "connections_count": random.randint(0, 500),
        "created_at":        fmt_dt(rand_dt(START_3Y, NOW)),
        "updated_at":        fmt_dt(rand_dt(START_3Y, NOW)),
    })
    member_ids.append(mid)
    member_resume_map[mid] = ""

print(f"  Generated {len(members):,} members")
print(f"  Generated {len(member_skills):,} member_skills  "
      f"(avg {len(member_skills)/len(members):.1f} skills/member)")
print(f"  Generated {len(member_experience):,} experience records")
print(f"  Generated {len(member_education):,} education records")


# ══════════════════════════════════════════════════════════════════════════════
# 3. JOBS  (from job_postings)
# ══════════════════════════════════════════════════════════════════════════════
print("\n[3/7] Building jobs + job_skills...")

n_jobs = min(N_JOBS, len(jobs_df))
jobs_sample = jobs_df.sample(n=n_jobs, random_state=42).reset_index(drop=True)

jobs_out      = []
job_ids       = []
job_skills_out = []

for _, row in jobs_sample.iterrows():
    jid = new_uuid()
    rid, cid = random.choice(recruiter_company_pairs)

    exp_raw   = safe_str(row.get("formatted_experience_level"))
    seniority = SENIORITY_MAP.get(exp_raw) or random.choice(list(SENIORITY_MAP.values()))

    wt_raw   = safe_str(row.get("formatted_work_type"))
    emp_type = WORK_TYPE_MAP.get(wt_raw) or random.choice(
        ["full_time", "part_time", "contract"]
    )

    remote_raw = row.get("remote_allowed")
    if pd.isna(remote_raw):
        remote_type = random.choice(["onsite", "remote", "hybrid"])
    elif safe_int(remote_raw) == 1:
        remote_type = random.choice(["remote", "hybrid"])
    else:
        remote_type = "onsite"

    salary_range = parse_salary(
        row.get("min_salary"),
        row.get("max_salary"),
        row.get("pay_period"),
    )

    status = random.choices(["open", "closed"], weights=[85, 15])[0]

    jobs_out.append({
        "job_id":           jid,
        "company_id":       cid,
        "recruiter_id":     rid,
        "title":            safe_str(row["title"],       maxlen=300),
        "description":      safe_str(row["description"], maxlen=10_000),
        "seniority_level":  seniority,
        "employment_type":  emp_type,
        "location":         safe_str(row.get("location"), maxlen=255) or fake.city(),
        "remote_type":      remote_type,
        "salary_range":     salary_range[:100],
        "status":           status,
        "posted_datetime":  ts_to_dt(row.get("listed_time")),
        "views_count":      safe_int(row.get("views")),
        "applicants_count": safe_int(row.get("applies")),
    })
    job_ids.append(jid)

    # Extract skills from skills_desc (comma-separated text)
    skills_desc = safe_str(row.get("skills_desc"))
    if skills_desc:
        raw_skills = [s.strip() for s in skills_desc.split(",") if s.strip()]
        for sk in raw_skills[:10]:
            if sk:
                job_skills_out.append({"job_id": jid, "skill": sk[:200]})

print(f"  Generated {len(jobs_out):,} jobs")
print(f"  Generated {len(job_skills_out):,} job_skills from skills_desc")


# ══════════════════════════════════════════════════════════════════════════════
# 4. APPLICATIONS  (~50K)
# ══════════════════════════════════════════════════════════════════════════════
print("\n[4/7] Building applications (~50K)...")

open_job_ids = [j["job_id"] for j in jobs_out if j["status"] == "open"] or job_ids
APP_STATUSES = ["submitted", "reviewing", "interview", "offer", "rejected"]
APP_WEIGHTS  = [35, 30, 20, 5, 10]
START_1Y     = datetime(2024, 4, 1)

applications  = []
seen_pairs: set = set()
attempts = 0

while len(applications) < N_APPLICATIONS and attempts < N_APPLICATIONS * 5:
    attempts += 1
    mid = random.choice(member_ids)
    jid = random.choice(open_job_ids)
    if (jid, mid) in seen_pairs:
        continue
    seen_pairs.add((jid, mid))

    applications.append({
        "application_id":       new_uuid(),
        "job_id":               jid,
        "member_id":            mid,
        "resume_url":           None,
        "resume_text":          member_resume_map.get(mid, "")[:8000],
        "cover_letter":         fake.paragraph(nb_sentences=5)[:2000],
        "application_datetime": fmt_dt(rand_dt(START_1Y, NOW)),
        "status":               random.choices(APP_STATUSES, weights=APP_WEIGHTS)[0],
    })

print(f"  Generated {len(applications):,} applications")


# ══════════════════════════════════════════════════════════════════════════════
# 5. MONGODB EVENTS  (100K+)
# ══════════════════════════════════════════════════════════════════════════════
print("\n[5/7] Building 100K MongoDB events...")

app_ids         = [a["application_id"] for a in applications]
thread_pool     = [new_uuid() for _ in range(2_000)]
connection_pool = [new_uuid() for _ in range(2_000)]
ai_task_pool    = [new_uuid() for _ in range(1_000)]

ENTITY_CONFIG = {
    "job.viewed":            ("job",         job_ids),
    "job.saved":             ("job",         job_ids),
    "application.submitted": ("application", app_ids),
    "message.sent":          ("thread",      thread_pool),
    "connection.requested":  ("connection",  connection_pool),
    "ai.requested":          ("ai_task",     ai_task_pool),
    "ai.completed":          ("ai_task",     ai_task_pool),
}
EVENT_WEIGHTS   = [25, 15, 20, 15, 10, 8, 7]
all_actor_ids   = member_ids + [r["recruiter_id"] for r in recruiters]
START_EVT       = datetime(2023, 1, 1)
event_type_list = list(ENTITY_CONFIG.keys())

events = []
for _ in range(N_EVENTS):
    evt_type                    = random.choices(event_type_list, weights=EVENT_WEIGHTS)[0]
    entity_type, entity_pool    = ENTITY_CONFIG[evt_type]
    ts                          = rand_dt(START_EVT, NOW)
    events.append({
        "event_type":      evt_type,
        "trace_id":        new_uuid(),
        "timestamp":       ts.isoformat() + "Z",
        "actor_id":        random.choice(all_actor_ids),
        "entity":          {"entity_type": entity_type,
                            "entity_id":   random.choice(entity_pool)},
        "payload":         {},
        "idempotency_key": new_uuid(),
    })

print(f"  Generated {len(events):,} events")


# ══════════════════════════════════════════════════════════════════════════════
# 6. CONNECTIONS, THREADS, MESSAGES
# ══════════════════════════════════════════════════════════════════════════════
print("\n[6/7] Building connections, threads, messages...")

connections  = []
conn_pairs: set = set()
while len(connections) < 10_000:
    a, b = random.sample(member_ids, 2)
    pair = (min(a, b), max(a, b))
    if pair in conn_pairs:
        continue
    conn_pairs.add(pair)
    connections.append({
        "connection_id": new_uuid(),
        "user_a":        pair[0],
        "user_b":        pair[1],
        "status":        random.choices(["pending", "accepted", "rejected"],
                                        weights=[20, 70, 10])[0],
        "requested_by":  random.choice([pair[0], pair[1]]),
        "created_at":    fmt_dt(rand_dt(START_3Y, NOW)),
    })

threads              = []
thread_participants  = []
messages             = []

for _ in range(2_000):
    tid     = new_uuid()
    created = rand_dt(START_1Y, NOW)
    threads.append({"thread_id": tid, "created_at": fmt_dt(created)})

    participants = random.sample(member_ids, 2)
    for uid in participants:
        thread_participants.append({"thread_id": tid, "user_id": uid})

    for i in range(random.randint(3, 8)):
        msg_time = created + timedelta(minutes=i * random.randint(1, 30))
        messages.append({
            "message_id":   new_uuid(),
            "thread_id":    tid,
            "sender_id":    random.choice(participants),
            "message_text": fake.sentence(nb_words=random.randint(5, 30))[:2000],
            "sent_at":      fmt_dt(msg_time),
        })

print(f"  Generated {len(connections):,} connections")
print(f"  Generated {len(threads):,} threads, {len(messages):,} messages")


# ══════════════════════════════════════════════════════════════════════════════
# 7. WRITE JSON SEEDS
# ══════════════════════════════════════════════════════════════════════════════
print("\n[7/7] Writing seed files to data/seeds/ ...")


def write_seed(filename: str, data: list) -> None:
    path = SEEDS / filename
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, default=str)
    print(f"  {filename:<30} {len(data):>8,} records  {path.stat().st_size // 1024:>6,} KB")


write_seed("members.json",             members)
write_seed("recruiters.json",          recruiters)
write_seed("jobs.json",                jobs_out)
write_seed("job_skills.json",          job_skills_out)
write_seed("applications.json",        applications)
write_seed("member_skills.json",       member_skills)
write_seed("member_experience.json",   member_experience)
write_seed("member_education.json",    member_education)
write_seed("connections.json",         connections)
write_seed("threads.json",             threads)
write_seed("thread_participants.json", thread_participants)
write_seed("messages.json",            messages)
write_seed("events.json",              events)

print("\n" + "=" * 60)
print("transform.py complete.")
print("=" * 60)
