"""
conftest.py — shared fixtures and helpers for the LinkedIn clone test suite.

Each service test file uses HTTP calls to the running microservices.
Tests are automatically skipped if the target service is not reachable.
"""

import uuid
import pytest
import requests

# ── Service base URLs ──────────────────────────────────────────────────────────
PROFILE_URL     = "http://localhost:8001"
JOB_URL         = "http://localhost:8002"
APPLICATION_URL = "http://localhost:8003"
MESSAGING_URL   = "http://localhost:8004"
CONNECTION_URL  = "http://localhost:8005"
ANALYTICS_URL   = "http://localhost:8006"
AI_URL          = "http://localhost:8007"

TIMEOUT = 5  # seconds


# ── Service availability ───────────────────────────────────────────────────────

def service_up(base_url: str) -> bool:
    """Return True if the service responds to a health/root request."""
    try:
        r = requests.get(f"{base_url}/health", timeout=TIMEOUT)
        return r.status_code < 500
    except requests.exceptions.ConnectionError:
        return False
    except requests.exceptions.Timeout:
        return False


def skip_if_down(base_url: str, name: str):
    """Return a pytest.mark.skipif decorator for a service."""
    return pytest.mark.skipif(
        not service_up(base_url),
        reason=f"{name} not reachable at {base_url}",
    )


# ── Per-service skip markers (used as class/function decorators) ───────────────
requires_profile     = skip_if_down(PROFILE_URL,     "Profile Service")
requires_job         = skip_if_down(JOB_URL,         "Job Service")
requires_application = skip_if_down(APPLICATION_URL, "Application Service")
requires_messaging   = skip_if_down(MESSAGING_URL,   "Messaging Service")
requires_connection  = skip_if_down(CONNECTION_URL,  "Connection Service")


# ── Response helpers ───────────────────────────────────────────────────────────

def assert_success(resp: requests.Response, expected_status: int = 200) -> dict:
    """Assert response is successful and return the data payload."""
    assert resp.status_code == expected_status, (
        f"Expected {expected_status}, got {resp.status_code}: {resp.text}"
    )
    body = resp.json()
    assert body.get("success") is True, f"Expected success=true: {body}"
    assert "trace_id" in body, "Missing trace_id"
    return body.get("data", body)


def assert_error(resp: requests.Response, expected_status: int, expected_code: str) -> dict:
    """Assert response is an error with the given HTTP status and error code."""
    assert resp.status_code == expected_status, (
        f"Expected {expected_status}, got {resp.status_code}: {resp.text}"
    )
    body = resp.json()
    assert body.get("success") is False, f"Expected success=false: {body}"
    error = body.get("error", {})
    assert error.get("code") == expected_code, (
        f"Expected error code '{expected_code}', got '{error.get('code')}'"
    )
    return error


# ── Unique value generators ────────────────────────────────────────────────────

def unique_email() -> str:
    return f"test_{uuid.uuid4().hex[:8]}@example.com"


def unique_name() -> str:
    return f"Test User {uuid.uuid4().hex[:6]}"


# ── API factory helpers ────────────────────────────────────────────────────────

def create_member(**overrides) -> dict:
    """POST /members and return the created member data."""
    payload = {
        "first_name": "Jane",
        "last_name": "Doe",
        "email": unique_email(),
        "phone": "555-0100",
        "location": "San Jose, CA",
        "headline": "Software Engineer",
        "about": "Passionate about distributed systems.",
        "connections_count": 0,
    }
    payload.update(overrides)
    resp = requests.post(f"{PROFILE_URL}/members", json=payload, timeout=TIMEOUT)
    return assert_success(resp, 201)


def create_recruiter(**overrides) -> dict:
    """POST /recruiters and return the created recruiter data."""
    payload = {
        "name": unique_name(),
        "email": unique_email(),
        "phone": "555-0200",
        "company_name": "Acme Corp",
        "company_industry": "Technology",
        "company_size": "51-200",
    }
    payload.update(overrides)
    resp = requests.post(f"{JOB_URL}/recruiters", json=payload, timeout=TIMEOUT)
    return assert_success(resp, 201)


def create_job(recruiter_id: str, **overrides) -> dict:
    """POST /jobs and return the created job data."""
    payload = {
        "recruiter_id": recruiter_id,
        "title": "Backend Engineer",
        "description": "Build scalable microservices.",
        "seniority_level": "mid",
        "employment_type": "full_time",
        "location": "San Jose, CA",
        "remote_type": "hybrid",
        "salary_range": "$120,000 - $160,000",
    }
    payload.update(overrides)
    resp = requests.post(f"{JOB_URL}/jobs", json=payload, timeout=TIMEOUT)
    return assert_success(resp, 201)


def submit_application(job_id: str, member_id: str, **overrides) -> dict:
    """POST /applications and return the created application data."""
    payload = {
        "job_id": job_id,
        "member_id": member_id,
        "cover_letter": "I am excited to apply.",
        "resume_text": "Experienced engineer with 5 years in Python.",
    }
    payload.update(overrides)
    resp = requests.post(f"{APPLICATION_URL}/applications", json=payload, timeout=TIMEOUT)
    return assert_success(resp, 201)


# ── Session-scoped fixtures for shared test objects ────────────────────────────

@pytest.fixture(scope="session")
def member():
    """A member created once for the whole test session."""
    if not service_up(PROFILE_URL):
        pytest.skip("Profile Service not reachable")
    return create_member()


@pytest.fixture(scope="session")
def recruiter():
    """A recruiter created once for the whole test session."""
    if not service_up(JOB_URL):
        pytest.skip("Job Service not reachable")
    return create_recruiter()


@pytest.fixture(scope="session")
def open_job(recruiter):
    """An open job created once for the whole test session."""
    if not service_up(JOB_URL):
        pytest.skip("Job Service not reachable")
    return create_job(recruiter["recruiter_id"])


@pytest.fixture(scope="session")
def application(member, open_job):
    """An application created once for the whole test session."""
    if not service_up(APPLICATION_URL):
        pytest.skip("Application Service not reachable")
    return submit_application(open_job["job_id"], member["member_id"])
