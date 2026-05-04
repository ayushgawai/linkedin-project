"""Service client wrappers for dependent microservices.

When ``USE_MOCK_SERVICES=true`` (the default), these functions return
realistic mock data so the AI service can run standalone.

To wire up real services, set ``USE_MOCK_SERVICES=false`` — each function
will then make an authenticated HTTP POST to the appropriate service.
"""
from __future__ import annotations

import uuid
from typing import Any

import httpx
from loguru import logger

from .config import get_settings


# ---------------------------------------------------------------------------
# Mock data factories
# ---------------------------------------------------------------------------

_MOCK_SKILLS_POOL = [
    ["python", "fastapi", "mongodb", "kafka", "docker"],
    ["javascript", "react", "node.js", "postgresql", "redis"],
    ["java", "spring", "kubernetes", "aws", "mysql"],
    ["python", "machine learning", "pytorch", "pandas", "numpy"],
    ["go", "kubernetes", "terraform", "aws", "grpc"],
    ["typescript", "angular", "graphql", "docker", "azure"],
    ["scala", "spark", "hadoop", "airflow", "sql"],
    ["python", "django", "elasticsearch", "redis", "postgresql"],
]

_MOCK_NAMES = [
    ("Alice", "Chen"), ("Bob", "Patel"), ("Carol", "Kim"),
    ("David", "Singh"), ("Eva", "Lopez"), ("Frank", "Wang"),
    ("Grace", "Johnson"), ("Hiro", "Tanaka"),
]

_MOCK_RESUMES = [
    "5 years of experience in Python and FastAPI. "
    "Worked at Google as a backend engineer. "
    "B.S. Computer Science at UC Berkeley 2018. "
    "Skills: python, fastapi, mongodb, kafka, docker, redis.",

    "3 years of full-stack development with React and Node.js. "
    "University of Texas at Austin, B.S. 2020. "
    "Skills: javascript, react, node.js, postgresql, redis, typescript.",

    "7 years of Java backend development at Amazon. "
    "Stanford University M.S. Computer Science 2016. "
    "Skills: java, spring, kubernetes, aws, mysql, docker.",

    "4 years of ML engineering, specialising in NLP and computer vision. "
    "MIT B.S. 2019. Skills: python, machine learning, pytorch, tensorflow, pandas.",

    "6 years of infrastructure and platform engineering. "
    "Carnegie Mellon University B.S. 2017. "
    "Skills: go, kubernetes, terraform, aws, grpc, linux.",
]


def _make_mock_application(job_id: str, idx: int) -> dict[str, Any]:
    first, last = _MOCK_NAMES[idx % len(_MOCK_NAMES)]
    member_id = f"mock-member-{idx+1:03d}"
    resume = _MOCK_RESUMES[idx % len(_MOCK_RESUMES)]
    return {
        "application_id": str(uuid.uuid4()),
        "job_id": job_id,
        "member_id": member_id,
        "member_name": f"{first} {last}",
        "resume_text": resume,
        "cover_letter": f"I am excited to apply for this role because of my experience with {_MOCK_SKILLS_POOL[idx % len(_MOCK_SKILLS_POOL)][0]}.",
        "status": "submitted",
    }


def _make_mock_profile(member_id: str, idx: int) -> dict[str, Any]:
    first, last = _MOCK_NAMES[idx % len(_MOCK_NAMES)]
    skills = _MOCK_SKILLS_POOL[idx % len(_MOCK_SKILLS_POOL)]
    return {
        "member_id": member_id,
        "first_name": first,
        "last_name": last,
        "email": f"{first.lower()}.{last.lower()}@example.com",
        "headline": f"Senior Engineer | {skills[0].title()}",
        "about": f"Experienced engineer with expertise in {', '.join(skills[:3])}.",
        "skills": skills,
        "location": "San Jose, CA",
        "experience": [
            {
                "title": "Senior Software Engineer",
                "company": "Tech Corp",
                "start_year": 2020,
                "end_year": None,
                "description": f"Building scalable systems with {skills[0]}.",
            }
        ],
        "education": [
            {
                "institution": "SJSU",
                "degree": "B.S. Computer Science",
                "year": 2020,
            }
        ],
    }


# ---------------------------------------------------------------------------
# Client functions
# ---------------------------------------------------------------------------


async def get_applications_by_job(
    job_id: str,
    page: int = 1,
    page_size: int = 50,
) -> list[dict[str, Any]]:
    """
    Fetch applications for *job_id* from the Application Service.

    Returns a list of application objects each containing at minimum:
    ``application_id``, ``job_id``, ``member_id``, ``resume_text``.
    """
    settings = get_settings()

    if settings.use_mock_services:
        logger.debug("Using mock applications for job_id={}", job_id)
        count = 5
        return [_make_mock_application(job_id, i) for i in range(count)]

    # Real HTTP call
    url = f"{settings.application_service_url}/applications/byJob"
    payload = {"job_id": job_id, "page": page, "page_size": page_size}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", {}).get("results", [])
    except Exception as exc:
        logger.error("get_applications_by_job failed: {}", exc)
        raise


async def get_job(job_id: str) -> dict[str, Any]:
    """
    Fetch a job posting from the Job Service.

    Returns a dict containing at minimum:
    ``job_id``, ``title``, ``description``, ``skills_required``, ``company_name``.
    Raises on HTTP error when using the real backend.
    """
    settings = get_settings()

    if settings.use_mock_services:
        logger.debug("Using mock job data for job_id={}", job_id)
        # Deterministic mock data keyed by hash of job_id
        mock_jobs = [
            {
                "job_id": job_id,
                "title": "Senior Backend Engineer",
                "description": (
                    "We are hiring a senior backend engineer to build distributed "
                    "systems with Python, FastAPI, Kafka, and MongoDB. You will "
                    "design microservices, own observability, and mentor peers."
                ),
                "skills_required": ["python", "fastapi", "kafka", "mongodb", "docker"],
                "company_name": "TechCorp",
                "seniority_level": "senior",
                "employment_type": "full-time",
                "location": "San Jose, CA",
                "remote_type": "hybrid",
            },
            {
                "job_id": job_id,
                "title": "Frontend React Engineer",
                "description": (
                    "Build engaging UIs with React, TypeScript, and Tailwind CSS. "
                    "Collaborate with designers on component libraries."
                ),
                "skills_required": ["javascript", "react", "typescript", "css"],
                "company_name": "TechCorp",
                "seniority_level": "mid",
                "employment_type": "full-time",
                "location": "Remote",
                "remote_type": "remote",
            },
            {
                "job_id": job_id,
                "title": "ML Engineer",
                "description": (
                    "Ship production ML systems: training pipelines, feature stores, "
                    "and real-time inference. PyTorch and Python required."
                ),
                "skills_required": ["python", "machine learning", "pytorch", "pandas"],
                "company_name": "TechCorp",
                "seniority_level": "senior",
                "employment_type": "full-time",
                "location": "San Francisco, CA",
                "remote_type": "hybrid",
            },
        ]
        # Deterministic mapping: job_id "j1" → backend role, "j2" → frontend,
        # "j3" → ML. Falls back to a stable hash for unknown ids so we never
        # pick a different mock across Python interpreter restarts.
        digits = "".join(ch for ch in job_id if ch.isdigit())
        if digits:
            try:
                idx = (int(digits) - 1) % len(mock_jobs)
            except ValueError:
                idx = abs(hash(job_id)) % len(mock_jobs)
        else:
            idx = abs(hash(job_id)) % len(mock_jobs)
        return mock_jobs[idx]

    url = f"{settings.job_service_url}/jobs/get"
    payload = {"job_id": job_id}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", {})
    except Exception as exc:
        logger.error("get_job failed for {}: {}", job_id, exc)
        raise


async def get_member_profile(member_id: str) -> dict[str, Any]:
    """
    Fetch a member's full profile from the Profile Service.

    Returns a dict containing at minimum: ``member_id``, ``skills``, ``headline``.
    """
    settings = get_settings()

    if settings.use_mock_services:
        # ---- Deterministic demo identities for the AI test contract ------
        # The Frontend Testing Assignment (tests 7 & 8) requires a member
        # with skills that produce a low match score (<30) and another
        # whose skills produce a high match score (>60) against backend
        # job j1. We hand-craft two canonical IDs so the result is stable
        # across runs and across machines. These take precedence over the
        # generic numeric mapping below.
        canonical: dict[str, dict[str, Any]] = {
            "demo-high-match": {
                "member_id": "demo-high-match",
                "first_name": "Highmatch",
                "last_name": "Demo",
                "email": "high.match@example.com",
                "headline": "Backend Engineer | Python, FastAPI, Kafka",
                "about": (
                    "Backend engineer with deep experience shipping production "
                    "Python services on Kafka and MongoDB inside Docker."
                ),
                "skills": ["python", "fastapi", "kafka", "mongodb", "docker"],
                "location": "San Jose, CA",
                "experience": [{
                    "title": "Senior Backend Engineer",
                    "company": "Tech Corp",
                    "start_year": 2020,
                    "end_year": None,
                    "description": "Built FastAPI services on Kafka + MongoDB.",
                }],
                "education": [{
                    "institution": "SJSU",
                    "degree": "B.S. Computer Science",
                    "year": 2020,
                }],
            },
            "demo-low-match": {
                "member_id": "demo-low-match",
                "first_name": "Lowmatch",
                "last_name": "Demo",
                "email": "low.match@example.com",
                "headline": "Marketing Specialist",
                "about": (
                    "Marketing professional focused on brand campaigns and "
                    "customer outreach. No backend engineering experience."
                ),
                "skills": ["marketing", "copywriting", "seo", "social media", "branding"],
                "location": "San Jose, CA",
                "experience": [{
                    "title": "Marketing Specialist",
                    "company": "BrandCo",
                    "start_year": 2021,
                    "end_year": None,
                    "description": "Led campaigns and customer outreach.",
                }],
                "education": [{
                    "institution": "SJSU",
                    "degree": "B.A. Communications",
                    "year": 2021,
                }],
            },
        }
        if member_id in canonical:
            logger.debug("Using canonical demo profile for member_id={}", member_id)
            return canonical[member_id]

        # ---- Deterministic numeric mapping for mock-member-NNN ----------
        # Extract the trailing digits so member_id "mock-member-001" maps
        # to skills pool index 0 (backend) → predictable high match against
        # job j1. This replaces the previous hash-based lookup which gave
        # different skills on every Python interpreter restart.
        idx = 0
        digits = "".join(ch for ch in member_id if ch.isdigit())
        if digits:
            try:
                idx = (int(digits) - 1) % len(_MOCK_SKILLS_POOL)
            except ValueError:
                idx = 0
        else:
            # Fallback for non-numeric IDs — stable but arbitrary.
            idx = abs(hash(member_id)) % len(_MOCK_SKILLS_POOL)
        logger.debug("Using mock profile for member_id={} (idx={})", member_id, idx)
        return _make_mock_profile(member_id, idx)

    url = f"{settings.profile_service_url}/members/get"
    payload = {"member_id": member_id}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", {})
    except Exception as exc:
        logger.error("get_member_profile failed for {}: {}", member_id, exc)
        raise


async def send_outreach_message(
    recruiter_id: str,
    member_id: str,
    message_text: str,
) -> dict[str, Any]:
    """
    Send an outreach message via the Messaging Service.

    Thread resolution handles both the fresh-thread and existing-thread
    cases. ``POST /threads/open`` is expected to be idempotent, but some
    implementations return HTTP 409 with an error code of
    ``THREAD_EXISTS`` / ``ALREADY_EXISTS`` plus the existing
    ``thread_id`` in the body. We accept either contract so outreach
    still succeeds when the recruiter↔member thread was already opened
    by a previous approval or by manual chat.
    """
    settings = get_settings()

    if settings.use_mock_services:
        logger.debug("Mock: send_outreach_message to member_id={}", member_id)
        return {"message_id": str(uuid.uuid4()), "sent": True}

    async with httpx.AsyncClient(timeout=10.0) as client:
        # ----- Resolve thread_id (open or reuse existing) -----
        thread_id: str | None = None
        thread_resp = await client.post(
            f"{settings.messaging_service_url}/threads/open",
            json={"participant_ids": [recruiter_id, member_id]},
        )
        if thread_resp.status_code in (200, 201):
            body = thread_resp.json()
            thread_id = body.get("thread_id") or (body.get("data") or {}).get("thread_id")
        elif thread_resp.status_code == 409:
            # Messaging Service says the thread already exists. Try to
            # pull thread_id out of the error body; if that's not
            # present, fall back to a lookup endpoint.
            try:
                body = thread_resp.json() or {}
            except Exception:  # noqa: BLE001
                body = {}
            data = body.get("data") or {}
            err = body.get("error") or {}
            thread_id = (
                data.get("thread_id")
                or err.get("thread_id")
                or (err.get("details") or {}).get("thread_id")
            )
            if not thread_id:
                # Fallback: resolve by participants. Swallow errors here —
                # the outer raise_for_status on this path still surfaces
                # a clean 502 to the caller.
                lookup = await client.post(
                    f"{settings.messaging_service_url}/threads/byParticipants",
                    json={"participant_ids": [recruiter_id, member_id]},
                )
                if lookup.status_code == 200:
                    lookup_body = lookup.json() or {}
                    thread_id = lookup_body.get("thread_id") or (
                        (lookup_body.get("data") or {}).get("thread_id")
                    )
        else:
            # Any other status — let raise_for_status produce the error
            thread_resp.raise_for_status()

        if not thread_id:
            raise RuntimeError(
                f"Could not resolve thread_id for recruiter={recruiter_id} "
                f"member={member_id} (messaging status={thread_resp.status_code})"
            )

        # ----- Send message on that thread -----
        msg_resp = await client.post(
            f"{settings.messaging_service_url}/messages/send",
            json={"thread_id": thread_id, "sender_id": recruiter_id, "message_text": message_text},
        )
        msg_resp.raise_for_status()
        body = msg_resp.json() or {}
        if isinstance(body.get("data"), dict):
            return body["data"]
        return body
