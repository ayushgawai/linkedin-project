"""
Gateway session + authorization (port 8000).

These tests hit the dev-gateway in front of services. They verify that sensitive
application/job endpoints require a logged-in session when using the gateway.

Skipped automatically when the gateway is not running (local pytest without Docker).

Direct microservice tests (e.g. test_application.py → APPLICATION_URL :8003) are
unchanged and do not use gateway auth.
"""

import pytest
import requests

from conftest import (
    APPLICATION_URL,
    GATEWAY_URL,
    JOB_URL,
    PROFILE_URL,
    TIMEOUT,
    create_member,
    service_up,
    skip_if_down,
    unique_email,
    unique_name,
)

requires_gateway = skip_if_down(GATEWAY_URL, "Dev gateway")


def login_via_gateway(email: str, password: str = "pw") -> tuple[str, dict]:
    r = requests.post(
        f"{GATEWAY_URL}/auth/login",
        json={"email": email, "password": password},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and "user" in data
    return data["token"], data["user"]


def create_recruiter_via_gateway():
    """Creates a recruiter through the gateway (profile + job registry hooks)."""
    email = unique_email()
    payload = {
        "email": email,
        "password": "secret",
        "full_name": unique_name(),
        "company_name": "Gateway Authz Test Co",
        "company_industry": "Technology",
        "company_size": "1-10",
    }
    r = requests.post(f"{GATEWAY_URL}/recruiters/create", json=payload, timeout=TIMEOUT)
    assert r.status_code == 201, r.text
    body = r.json()
    return body["token"], body["user"]


def create_job_via_gateway(token: str, recruiter_id: str) -> dict:
    """POST /jobs through gateway (matches pytest create_job shape)."""
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
    r = requests.post(
        f"{GATEWAY_URL}/jobs",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture(scope="module")
def gateway_stack_up():
    """Require gateway + profile + job for hiring flows."""
    if not service_up(GATEWAY_URL):
        pytest.skip("Gateway not reachable")
    if not service_up(PROFILE_URL):
        pytest.skip("Profile service not reachable")
    if not service_up(JOB_URL):
        pytest.skip("Job service not reachable")
    if not service_up(APPLICATION_URL):
        pytest.skip("Application service not reachable")


@requires_gateway
class TestGatewayApplicationAuthz:
    def test_by_job_without_token_returns_401(self):
        """Anonymous callers cannot list applicants through the gateway."""
        if not service_up(GATEWAY_URL):
            pytest.skip("Gateway not reachable")
        r = requests.post(
            f"{GATEWAY_URL}/applications/byJob",
            json={"job_id": "00000000-0000-0000-0000-000000000001", "page": 1, "page_size": 20},
            timeout=TIMEOUT,
        )
        assert r.status_code == 401
        body = r.json()
        assert body.get("success") is False or "message" in body

    def test_by_job_as_member_returns_403(self, gateway_stack_up):
        m = create_member()
        token, _user = login_via_gateway(m["email"])
        job_id = "00000000-0000-0000-0000-000000000002"
        r = requests.post(
            f"{GATEWAY_URL}/applications/byJob",
            json={"job_id": job_id, "page": 1, "page_size": 20},
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403

    def test_by_job_as_owning_recruiter_returns_200(self, gateway_stack_up):
        token, user = create_recruiter_via_gateway()
        rid = user["recruiter_id"]
        job = create_job_via_gateway(token, rid)
        r = requests.post(
            f"{GATEWAY_URL}/applications/byJob",
            json={"job_id": job["job_id"], "page": 1, "page_size": 20},
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("items"), list)

    def test_by_job_other_recruiter_returns_403(self, gateway_stack_up):
        token_a, user_a = create_recruiter_via_gateway()
        token_b, user_b = create_recruiter_via_gateway()
        job = create_job_via_gateway(token_a, user_a["recruiter_id"])
        r = requests.post(
            f"{GATEWAY_URL}/applications/byJob",
            json={"job_id": job["job_id"], "page": 1, "page_size": 20},
            headers={"Authorization": f"Bearer {token_b}"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403


@requires_gateway
class TestGatewayJobAuthz:
    def test_by_recruiter_wrong_id_returns_403(self, gateway_stack_up):
        _token_a, user_a = create_recruiter_via_gateway()
        token_b, _user_b = create_recruiter_via_gateway()
        r = requests.post(
            f"{GATEWAY_URL}/jobs/byRecruiter",
            json={"recruiter_id": user_a["recruiter_id"], "page": 1, "page_size": 20},
            headers={"Authorization": f"Bearer {token_b}"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 403


@requires_gateway
class TestGatewayRegistersSessionOnSignup:
    """After recruiter/create through gateway, token must work for protected routes."""

    def test_recruiter_create_through_gateway_registers_session(self, gateway_stack_up):
        email = unique_email()
        payload = {
            "email": email,
            "password": "secret",
            "full_name": unique_name(),
            "company_name": "Gate Test Co",
            "company_industry": "Tech",
            "company_size": "1-10",
        }
        cr = requests.post(f"{GATEWAY_URL}/recruiters/create", json=payload, timeout=TIMEOUT)
        assert cr.status_code == 201, cr.text
        body = cr.json()
        token = body["token"]
        user = body["user"]
        rid = user["recruiter_id"]
        jr = requests.post(
            f"{GATEWAY_URL}/jobs/byRecruiter",
            json={"recruiter_id": rid, "page": 1, "page_size": 20},
            headers={"Authorization": f"Bearer {token}"},
            timeout=TIMEOUT,
        )
        assert jr.status_code == 200
