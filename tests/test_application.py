"""
test_application.py — Application Service tests (port 8003)

Covers: submit, get, byJob, byMember, updateStatus (valid + invalid transitions),
        addNote, duplicate_application, job_closed.

Valid status transitions:
  submitted  → reviewing  ✓
  submitted  → rejected   ✓
  reviewing  → interview  ✓
  reviewing  → rejected   ✓
  interview  → offer      ✓
  interview  → rejected   ✓
  offer      → *          ✗  (terminal)
  rejected   → *          ✗  (terminal)
  submitted  → offer      ✗  (skips stages)
  submitted  → interview  ✗  (skips stages)
"""

import pytest
import requests

from conftest import (
    APPLICATION_URL, JOB_URL, TIMEOUT,
    assert_success, assert_error,
    create_member, create_recruiter, create_job, submit_application,
    requires_application,
)


@requires_application
class TestSubmitApplication:
    def test_submit_returns_201(self, open_job, member):
        # Use fresh member to avoid UNIQUE constraint with session-scoped fixture
        fresh_member = create_member()
        resp = requests.post(f"{APPLICATION_URL}/applications", json={
            "job_id": open_job["job_id"],
            "member_id": fresh_member["member_id"],
            "cover_letter": "I am a great fit.",
            "resume_text": "5 years Python experience.",
        }, timeout=TIMEOUT)
        data = assert_success(resp, 201)
        assert "application_id" in data
        assert data["status"] == "submitted"

    def test_submit_missing_job_id_returns_400(self, member):
        resp = requests.post(f"{APPLICATION_URL}/applications", json={
            "member_id": member["member_id"],
            "cover_letter": "Hello.",
        }, timeout=TIMEOUT)
        assert resp.status_code == 400

    def test_submit_missing_member_id_returns_400(self, open_job):
        resp = requests.post(f"{APPLICATION_URL}/applications", json={
            "job_id": open_job["job_id"],
            "cover_letter": "Hello.",
        }, timeout=TIMEOUT)
        assert resp.status_code == 400

    def test_duplicate_application_returns_409(self, open_job):
        fresh_member = create_member()
        submit_application(open_job["job_id"], fresh_member["member_id"])
        resp = requests.post(f"{APPLICATION_URL}/applications", json={
            "job_id": open_job["job_id"],
            "member_id": fresh_member["member_id"],
            "cover_letter": "Applying again.",
        }, timeout=TIMEOUT)
        assert_error(resp, 409, "DUPLICATE_APPLICATION")

    def test_apply_to_closed_job_returns_409(self, recruiter, member):
        job = create_job(recruiter["recruiter_id"])
        requests.patch(f"{JOB_URL}/jobs/{job['job_id']}/close", timeout=TIMEOUT)
        fresh_member = create_member()
        resp = requests.post(f"{APPLICATION_URL}/applications", json={
            "job_id": job["job_id"],
            "member_id": fresh_member["member_id"],
            "cover_letter": "Applying to closed job.",
        }, timeout=TIMEOUT)
        assert_error(resp, 409, "JOB_CLOSED")


@requires_application
class TestGetApplication:
    def test_get_existing_application(self, application):
        resp = requests.get(
            f"{APPLICATION_URL}/applications/{application['application_id']}",
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        assert data["application_id"] == application["application_id"]

    def test_get_nonexistent_application_returns_404(self):
        resp = requests.get(
            f"{APPLICATION_URL}/applications/00000000-0000-0000-0000-000000000000",
            timeout=TIMEOUT,
        )
        assert_error(resp, 404, "NOT_FOUND")


@requires_application
class TestApplicationsByJob:
    def test_list_by_job_id(self, open_job, application):
        resp = requests.get(
            f"{APPLICATION_URL}/applications",
            params={"job_id": open_job["job_id"]},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", data)
        assert any(a["application_id"] == application["application_id"] for a in items)

    def test_list_by_unknown_job_returns_empty(self):
        resp = requests.get(
            f"{APPLICATION_URL}/applications",
            params={"job_id": "00000000-0000-0000-0000-000000000000"},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", [])
        assert items == []


@requires_application
class TestApplicationsByMember:
    def test_list_by_member_id(self, member, application):
        resp = requests.get(
            f"{APPLICATION_URL}/applications",
            params={"member_id": member["member_id"]},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", data)
        assert any(a["application_id"] == application["application_id"] for a in items)

    def test_list_by_unknown_member_returns_empty(self):
        resp = requests.get(
            f"{APPLICATION_URL}/applications",
            params={"member_id": "00000000-0000-0000-0000-000000000000"},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", [])
        assert items == []


@requires_application
class TestStatusTransitions:
    def _fresh_application(self, open_job):
        m = create_member()
        return submit_application(open_job["job_id"], m["member_id"])

    def _update_status(self, app_id: str, status: str) -> requests.Response:
        return requests.patch(
            f"{APPLICATION_URL}/applications/{app_id}/status",
            json={"status": status},
            timeout=TIMEOUT,
        )

    # ── Valid transitions ──────────────────────────────────────────────────────

    def test_submitted_to_reviewing(self, open_job):
        app = self._fresh_application(open_job)
        resp = self._update_status(app["application_id"], "reviewing")
        data = assert_success(resp, 200)
        assert data["status"] == "reviewing"

    def test_submitted_to_rejected(self, open_job):
        app = self._fresh_application(open_job)
        resp = self._update_status(app["application_id"], "rejected")
        data = assert_success(resp, 200)
        assert data["status"] == "rejected"

    def test_reviewing_to_interview(self, open_job):
        app = self._fresh_application(open_job)
        self._update_status(app["application_id"], "reviewing")
        resp = self._update_status(app["application_id"], "interview")
        data = assert_success(resp, 200)
        assert data["status"] == "interview"

    def test_reviewing_to_rejected(self, open_job):
        app = self._fresh_application(open_job)
        self._update_status(app["application_id"], "reviewing")
        resp = self._update_status(app["application_id"], "rejected")
        data = assert_success(resp, 200)
        assert data["status"] == "rejected"

    def test_interview_to_offer(self, open_job):
        app = self._fresh_application(open_job)
        self._update_status(app["application_id"], "reviewing")
        self._update_status(app["application_id"], "interview")
        resp = self._update_status(app["application_id"], "offer")
        data = assert_success(resp, 200)
        assert data["status"] == "offer"

    def test_interview_to_rejected(self, open_job):
        app = self._fresh_application(open_job)
        self._update_status(app["application_id"], "reviewing")
        self._update_status(app["application_id"], "interview")
        resp = self._update_status(app["application_id"], "rejected")
        data = assert_success(resp, 200)
        assert data["status"] == "rejected"

    # ── Invalid transitions ────────────────────────────────────────────────────

    def test_submitted_to_offer_is_invalid(self, open_job):
        app = self._fresh_application(open_job)
        resp = self._update_status(app["application_id"], "offer")
        assert_error(resp, 400, "INVALID_STATUS_TRANSITION")

    def test_submitted_to_interview_is_invalid(self, open_job):
        app = self._fresh_application(open_job)
        resp = self._update_status(app["application_id"], "interview")
        assert_error(resp, 400, "INVALID_STATUS_TRANSITION")

    def test_offer_to_rejected_is_invalid(self, open_job):
        app = self._fresh_application(open_job)
        self._update_status(app["application_id"], "reviewing")
        self._update_status(app["application_id"], "interview")
        self._update_status(app["application_id"], "offer")
        resp = self._update_status(app["application_id"], "rejected")
        assert_error(resp, 400, "INVALID_STATUS_TRANSITION")

    def test_rejected_to_reviewing_is_invalid(self, open_job):
        app = self._fresh_application(open_job)
        self._update_status(app["application_id"], "rejected")
        resp = self._update_status(app["application_id"], "reviewing")
        assert_error(resp, 400, "INVALID_STATUS_TRANSITION")

    def test_update_nonexistent_application_returns_404(self):
        resp = requests.patch(
            f"{APPLICATION_URL}/applications/00000000-0000-0000-0000-000000000000/status",
            json={"status": "reviewing"},
            timeout=TIMEOUT,
        )
        assert_error(resp, 404, "NOT_FOUND")


@requires_application
class TestAddNote:
    def test_add_note_returns_201(self, application, recruiter):
        resp = requests.post(
            f"{APPLICATION_URL}/applications/{application['application_id']}/notes",
            json={
                "recruiter_id": recruiter["recruiter_id"],
                "note_text": "Strong candidate — move to interview.",
            },
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 201)
        assert "note_id" in data

    def test_add_note_nonexistent_application_returns_404(self, recruiter):
        resp = requests.post(
            f"{APPLICATION_URL}/applications/00000000-0000-0000-0000-000000000000/notes",
            json={
                "recruiter_id": recruiter["recruiter_id"],
                "note_text": "Ghost note.",
            },
            timeout=TIMEOUT,
        )
        assert_error(resp, 404, "NOT_FOUND")
