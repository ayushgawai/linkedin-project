"""
test_job.py — Job Service tests (port 8002)

Covers: create, get, update, search with filters, close, already_closed,
        recruiter_not_found, byRecruiter.
"""

import pytest
import requests

from conftest import (
    JOB_URL, TIMEOUT,
    assert_success, assert_error,
    create_recruiter, create_job, unique_email, requires_job,
)


@requires_job
class TestCreateJob:
    def test_create_returns_201(self, recruiter):
        resp = requests.post(f"{JOB_URL}/jobs", json={
            "recruiter_id": recruiter["recruiter_id"],
            "title": "Data Engineer",
            "description": "Build data pipelines.",
            "employment_type": "full_time",
            "location": "Remote",
            "remote_type": "remote",
        }, timeout=TIMEOUT)
        data = assert_success(resp, 201)
        assert "job_id" in data
        assert data["title"] == "Data Engineer"

    def test_create_missing_title_returns_400(self, recruiter):
        resp = requests.post(f"{JOB_URL}/jobs", json={
            "recruiter_id": recruiter["recruiter_id"],
            "description": "No title.",
        }, timeout=TIMEOUT)
        assert resp.status_code == 400

    def test_create_missing_description_returns_400(self, recruiter):
        resp = requests.post(f"{JOB_URL}/jobs", json={
            "recruiter_id": recruiter["recruiter_id"],
            "title": "No Desc",
        }, timeout=TIMEOUT)
        assert resp.status_code == 400

    def test_recruiter_not_found_returns_404(self):
        resp = requests.post(f"{JOB_URL}/jobs", json={
            "recruiter_id": "00000000-0000-0000-0000-000000000000",
            "title": "Ghost Job",
            "description": "Ghost description.",
        }, timeout=TIMEOUT)
        assert_error(resp, 404, "RECRUITER_NOT_FOUND")


@requires_job
class TestGetJob:
    def test_get_existing_job(self, open_job):
        resp = requests.get(
            f"{JOB_URL}/jobs/{open_job['job_id']}", timeout=TIMEOUT
        )
        data = assert_success(resp, 200)
        assert data["job_id"] == open_job["job_id"]

    def test_get_nonexistent_job_returns_404(self):
        resp = requests.get(
            f"{JOB_URL}/jobs/00000000-0000-0000-0000-000000000000",
            timeout=TIMEOUT,
        )
        assert_error(resp, 404, "NOT_FOUND")


@requires_job
class TestUpdateJob:
    def test_update_title(self, recruiter):
        job = create_job(recruiter["recruiter_id"])
        resp = requests.put(
            f"{JOB_URL}/jobs/{job['job_id']}",
            json={"title": "Senior Data Engineer"},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        assert data["title"] == "Senior Data Engineer"

    def test_update_salary_range(self, recruiter):
        job = create_job(recruiter["recruiter_id"])
        resp = requests.put(
            f"{JOB_URL}/jobs/{job['job_id']}",
            json={"salary_range": "$150,000 - $200,000"},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        assert data["salary_range"] == "$150,000 - $200,000"

    def test_update_nonexistent_job_returns_404(self):
        resp = requests.put(
            f"{JOB_URL}/jobs/00000000-0000-0000-0000-000000000000",
            json={"title": "Ghost"},
            timeout=TIMEOUT,
        )
        assert_error(resp, 404, "NOT_FOUND")


@requires_job
class TestSearchJobs:
    def test_search_by_keyword(self):
        resp = requests.get(
            f"{JOB_URL}/jobs/search", params={"q": "Engineer"}, timeout=TIMEOUT
        )
        data = assert_success(resp, 200)
        assert isinstance(data, (list, dict))

    def test_search_by_location(self):
        resp = requests.get(
            f"{JOB_URL}/jobs/search", params={"location": "Remote"}, timeout=TIMEOUT
        )
        assert resp.status_code == 200

    def test_search_by_employment_type(self):
        resp = requests.get(
            f"{JOB_URL}/jobs/search",
            params={"employment_type": "full_time"},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 200

    def test_search_no_results(self):
        resp = requests.get(
            f"{JOB_URL}/jobs/search",
            params={"q": "xyzzy_no_match_9999"},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", [])
        assert items == []


@requires_job
class TestCloseJob:
    def test_close_open_job(self, recruiter):
        job = create_job(recruiter["recruiter_id"])
        resp = requests.patch(
            f"{JOB_URL}/jobs/{job['job_id']}/close", timeout=TIMEOUT
        )
        data = assert_success(resp, 200)
        assert data["status"] == "closed"

    def test_close_already_closed_returns_409(self, recruiter):
        job = create_job(recruiter["recruiter_id"])
        # Close once
        requests.patch(f"{JOB_URL}/jobs/{job['job_id']}/close", timeout=TIMEOUT)
        # Close again
        resp = requests.patch(
            f"{JOB_URL}/jobs/{job['job_id']}/close", timeout=TIMEOUT
        )
        assert_error(resp, 409, "ALREADY_CLOSED")

    def test_close_nonexistent_job_returns_404(self):
        resp = requests.patch(
            f"{JOB_URL}/jobs/00000000-0000-0000-0000-000000000000/close",
            timeout=TIMEOUT,
        )
        assert_error(resp, 404, "NOT_FOUND")


@requires_job
class TestJobsByRecruiter:
    def test_list_jobs_by_recruiter(self, recruiter, open_job):
        resp = requests.get(
            f"{JOB_URL}/jobs",
            params={"recruiter_id": recruiter["recruiter_id"]},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", data)
        assert any(j["job_id"] == open_job["job_id"] for j in items)

    def test_list_jobs_unknown_recruiter_returns_empty(self):
        resp = requests.get(
            f"{JOB_URL}/jobs",
            params={"recruiter_id": "00000000-0000-0000-0000-000000000000"},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", [])
        assert items == []
