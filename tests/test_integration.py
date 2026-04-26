"""
test_integration.py — End-to-end integration tests spanning multiple services.

Full flow:
  1. Create a member            (Profile Service  :8001)
  2. Create a recruiter         (Job Service      :8002)
  3. Create a job               (Job Service      :8002)
  4. Submit an application      (Application Svc  :8003)
  5. Advance application status (Application Svc  :8003)
  6. Verify application in byMember listing
  7. Close the job              (Job Service      :8002)
  8. Verify job no longer accepts new applications
"""

import pytest
import requests

from conftest import (
    PROFILE_URL, JOB_URL, APPLICATION_URL, TIMEOUT,
    assert_success, assert_error,
    create_member, create_recruiter, create_job, submit_application,
    service_up,
)


def all_services_up() -> bool:
    return (
        service_up(PROFILE_URL)
        and service_up(JOB_URL)
        and service_up(APPLICATION_URL)
    )


pytestmark = pytest.mark.integration


@pytest.mark.skipif(not all_services_up(), reason="One or more services not reachable")
class TestFullApplicationFlow:
    """
    Verifies the complete member-applies-for-job lifecycle across three services.
    All steps share state via instance attributes to form a sequential story.
    """

    # ── Step 1: Create member ──────────────────────────────────────────────────
    def test_01_create_member(self, tmp_state):
        resp = requests.post(f"{PROFILE_URL}/members", json={
            "first_name": "Integration",
            "last_name": "Tester",
            "email": f"integration_{id(self)}@test.com",
            "headline": "QA Engineer",
        }, timeout=TIMEOUT)
        data = assert_success(resp, 201)
        assert "member_id" in data
        tmp_state["member_id"] = data["member_id"]
        tmp_state["member_email"] = data["email"]

    # ── Step 2: Create recruiter ───────────────────────────────────────────────
    def test_02_create_recruiter(self, tmp_state):
        resp = requests.post(f"{JOB_URL}/recruiters", json={
            "name": "Hiring Manager",
            "email": f"recruiter_{id(self)}@company.com",
            "company_name": "Integration Corp",
            "company_industry": "Technology",
            "company_size": "51-200",
        }, timeout=TIMEOUT)
        data = assert_success(resp, 201)
        assert "recruiter_id" in data
        tmp_state["recruiter_id"] = data["recruiter_id"]

    # ── Step 3: Create job ─────────────────────────────────────────────────────
    def test_03_create_job(self, tmp_state):
        resp = requests.post(f"{JOB_URL}/jobs", json={
            "recruiter_id": tmp_state["recruiter_id"],
            "title": "Integration Test Engineer",
            "description": "Write tests for distributed systems.",
            "employment_type": "full_time",
            "location": "San Jose, CA",
            "remote_type": "hybrid",
            "salary_range": "$100,000 - $140,000",
        }, timeout=TIMEOUT)
        data = assert_success(resp, 201)
        assert "job_id" in data
        assert data["status"] == "open"
        tmp_state["job_id"] = data["job_id"]

    # ── Step 4: Submit application ─────────────────────────────────────────────
    def test_04_submit_application(self, tmp_state):
        resp = requests.post(f"{APPLICATION_URL}/applications", json={
            "job_id": tmp_state["job_id"],
            "member_id": tmp_state["member_id"],
            "cover_letter": "I specialize in distributed systems testing.",
            "resume_text": "3 years of QA experience in microservices.",
        }, timeout=TIMEOUT)
        data = assert_success(resp, 201)
        assert data["status"] == "submitted"
        assert data["job_id"] == tmp_state["job_id"]
        assert data["member_id"] == tmp_state["member_id"]
        tmp_state["application_id"] = data["application_id"]

    # ── Step 5: Advance status → reviewing ────────────────────────────────────
    def test_05_advance_to_reviewing(self, tmp_state):
        resp = requests.patch(
            f"{APPLICATION_URL}/applications/{tmp_state['application_id']}/status",
            json={"status": "reviewing"},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        assert data["status"] == "reviewing"

    # ── Step 6: Advance status → interview ────────────────────────────────────
    def test_06_advance_to_interview(self, tmp_state):
        resp = requests.patch(
            f"{APPLICATION_URL}/applications/{tmp_state['application_id']}/status",
            json={"status": "interview"},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        assert data["status"] == "interview"

    # ── Step 7: Verify application appears in byMember listing ────────────────
    def test_07_application_visible_in_by_member(self, tmp_state):
        resp = requests.get(
            f"{APPLICATION_URL}/applications",
            params={"member_id": tmp_state["member_id"]},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", data)
        app_ids = [a["application_id"] for a in items]
        assert tmp_state["application_id"] in app_ids

    # ── Step 8: Verify application appears in byJob listing ───────────────────
    def test_08_application_visible_in_by_job(self, tmp_state):
        resp = requests.get(
            f"{APPLICATION_URL}/applications",
            params={"job_id": tmp_state["job_id"]},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", data)
        app_ids = [a["application_id"] for a in items]
        assert tmp_state["application_id"] in app_ids

    # ── Step 9: Close the job ──────────────────────────────────────────────────
    def test_09_close_job(self, tmp_state):
        resp = requests.patch(
            f"{JOB_URL}/jobs/{tmp_state['job_id']}/close", timeout=TIMEOUT
        )
        data = assert_success(resp, 200)
        assert data["status"] == "closed"

    # ── Step 10: Applying to closed job is rejected ────────────────────────────
    def test_10_apply_to_closed_job_is_rejected(self, tmp_state):
        new_member = create_member()
        resp = requests.post(f"{APPLICATION_URL}/applications", json={
            "job_id": tmp_state["job_id"],
            "member_id": new_member["member_id"],
            "cover_letter": "Trying to apply to a closed job.",
        }, timeout=TIMEOUT)
        assert_error(resp, 409, "JOB_CLOSED")

    # ── Step 11: Get final application state ──────────────────────────────────
    def test_11_get_final_application_state(self, tmp_state):
        resp = requests.get(
            f"{APPLICATION_URL}/applications/{tmp_state['application_id']}",
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        assert data["status"] == "interview"
        assert data["job_id"] == tmp_state["job_id"]
        assert data["member_id"] == tmp_state["member_id"]


# ── Shared mutable state fixture for sequential tests ─────────────────────────
@pytest.fixture(scope="class")
def tmp_state():
    """Dict shared across all tests in the class to thread state between steps."""
    return {}
