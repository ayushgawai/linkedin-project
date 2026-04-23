"""
test_failures.py — One explicit test per documented failure mode.

Failure mode table:
  Error                            Code                       HTTP
  ─────────────────────────────────────────────────────────────────
  Duplicate member email           DUPLICATE_EMAIL            409
  Duplicate application            DUPLICATE_APPLICATION      409
  Apply to closed job              JOB_CLOSED                 409
  Kafka unavailable                KAFKA_UNAVAILABLE          503
  Missing entity on any GET        NOT_FOUND                  404
  Invalid app status transition    INVALID_STATUS_TRANSITION  400
  Recruiter not found on job create RECRUITER_NOT_FOUND       404
  Job already closed               ALREADY_CLOSED             409
  Message send + Kafka unavailable KAFKA_UNAVAILABLE          503
"""

import pytest
import requests
from unittest.mock import patch

from conftest import (
    PROFILE_URL, JOB_URL, APPLICATION_URL, MESSAGING_URL, TIMEOUT,
    assert_success, assert_error,
    create_member, create_recruiter, create_job, submit_application,
    service_up, unique_email,
)

pytestmark = pytest.mark.failure


# ── 1. DUPLICATE_EMAIL ─────────────────────────────────────────────────────────

@pytest.mark.skipif(not service_up(PROFILE_URL), reason="Profile Service not reachable")
def test_failure_duplicate_email():
    """Creating two members with the same email must return 409 DUPLICATE_EMAIL."""
    email = unique_email()
    create_member(email=email)

    resp = requests.post(f"{PROFILE_URL}/members", json={
        "first_name": "Clone",
        "last_name": "User",
        "email": email,
    }, timeout=TIMEOUT)
    assert_error(resp, 409, "DUPLICATE_EMAIL")


# ── 2. DUPLICATE_APPLICATION ───────────────────────────────────────────────────

@pytest.mark.skipif(
    not (service_up(PROFILE_URL) and service_up(JOB_URL) and service_up(APPLICATION_URL)),
    reason="Required services not reachable",
)
def test_failure_duplicate_application():
    """Submitting to the same job twice must return 409 DUPLICATE_APPLICATION."""
    recruiter = create_recruiter()
    job = create_job(recruiter["recruiter_id"])
    member = create_member()

    submit_application(job["job_id"], member["member_id"])

    resp = requests.post(f"{APPLICATION_URL}/applications", json={
        "job_id": job["job_id"],
        "member_id": member["member_id"],
        "cover_letter": "Applying again.",
    }, timeout=TIMEOUT)
    assert_error(resp, 409, "DUPLICATE_APPLICATION")


# ── 3. JOB_CLOSED ──────────────────────────────────────────────────────────────

@pytest.mark.skipif(
    not (service_up(JOB_URL) and service_up(APPLICATION_URL) and service_up(PROFILE_URL)),
    reason="Required services not reachable",
)
def test_failure_job_closed():
    """Applying to a closed job must return 409 JOB_CLOSED."""
    recruiter = create_recruiter()
    job = create_job(recruiter["recruiter_id"])
    requests.patch(f"{JOB_URL}/jobs/{job['job_id']}/close", timeout=TIMEOUT)

    member = create_member()
    resp = requests.post(f"{APPLICATION_URL}/applications", json={
        "job_id": job["job_id"],
        "member_id": member["member_id"],
        "cover_letter": "Trying to apply to closed job.",
    }, timeout=TIMEOUT)
    assert_error(resp, 409, "JOB_CLOSED")


# ── 4. KAFKA_UNAVAILABLE (application submission) ─────────────────────────────

@pytest.mark.skipif(
    not (service_up(APPLICATION_URL) and service_up(PROFILE_URL) and service_up(JOB_URL)),
    reason="Required services not reachable",
)
def test_failure_kafka_unavailable_on_application():
    """
    When Kafka is down, submitting an application that triggers an event
    must return 503 KAFKA_UNAVAILABLE.

    This test relies on the Application Service exposing a test endpoint or
    config that forces Kafka failure. If no such mechanism exists, the test
    sends a request to the service's Kafka-error simulation endpoint.
    """
    resp = requests.post(
        f"{APPLICATION_URL}/test/simulate-kafka-failure",
        json={"scenario": "application.submitted"},
        timeout=TIMEOUT,
    )
    # Accept 404 if the simulation endpoint is not implemented yet,
    # but require 503 KAFKA_UNAVAILABLE if it is.
    if resp.status_code == 404:
        pytest.skip("Kafka failure simulation endpoint not implemented")
    assert_error(resp, 503, "KAFKA_UNAVAILABLE")


# ── 5. NOT_FOUND ───────────────────────────────────────────────────────────────

@pytest.mark.skipif(not service_up(PROFILE_URL), reason="Profile Service not reachable")
def test_failure_not_found_member():
    """GET on a nonexistent member must return 404 NOT_FOUND."""
    resp = requests.get(
        f"{PROFILE_URL}/members/00000000-0000-0000-0000-000000000000",
        timeout=TIMEOUT,
    )
    assert_error(resp, 404, "NOT_FOUND")


@pytest.mark.skipif(not service_up(JOB_URL), reason="Job Service not reachable")
def test_failure_not_found_job():
    """GET on a nonexistent job must return 404 NOT_FOUND."""
    resp = requests.get(
        f"{JOB_URL}/jobs/00000000-0000-0000-0000-000000000000",
        timeout=TIMEOUT,
    )
    assert_error(resp, 404, "NOT_FOUND")


@pytest.mark.skipif(not service_up(APPLICATION_URL), reason="Application Service not reachable")
def test_failure_not_found_application():
    """GET on a nonexistent application must return 404 NOT_FOUND."""
    resp = requests.get(
        f"{APPLICATION_URL}/applications/00000000-0000-0000-0000-000000000000",
        timeout=TIMEOUT,
    )
    assert_error(resp, 404, "NOT_FOUND")


# ── 6. INVALID_STATUS_TRANSITION ───────────────────────────────────────────────

@pytest.mark.skipif(
    not (service_up(APPLICATION_URL) and service_up(PROFILE_URL) and service_up(JOB_URL)),
    reason="Required services not reachable",
)
def test_failure_invalid_status_transition():
    """
    Transitioning from 'submitted' directly to 'offer' (skipping reviewing
    and interview) must return 400 INVALID_STATUS_TRANSITION.
    """
    recruiter = create_recruiter()
    job = create_job(recruiter["recruiter_id"])
    member = create_member()
    app = submit_application(job["job_id"], member["member_id"])

    resp = requests.patch(
        f"{APPLICATION_URL}/applications/{app['application_id']}/status",
        json={"status": "offer"},
        timeout=TIMEOUT,
    )
    assert_error(resp, 400, "INVALID_STATUS_TRANSITION")


# ── 7. RECRUITER_NOT_FOUND ─────────────────────────────────────────────────────

@pytest.mark.skipif(not service_up(JOB_URL), reason="Job Service not reachable")
def test_failure_recruiter_not_found():
    """
    Creating a job with a nonexistent recruiter_id must return
    404 RECRUITER_NOT_FOUND.
    """
    resp = requests.post(f"{JOB_URL}/jobs", json={
        "recruiter_id": "00000000-0000-0000-0000-000000000000",
        "title": "Ghost Job",
        "description": "This job has no recruiter.",
        "employment_type": "full_time",
    }, timeout=TIMEOUT)
    assert_error(resp, 404, "RECRUITER_NOT_FOUND")


# ── 8. ALREADY_CLOSED ─────────────────────────────────────────────────────────

@pytest.mark.skipif(not service_up(JOB_URL), reason="Job Service not reachable")
def test_failure_already_closed():
    """
    Closing a job that is already closed must return 409 ALREADY_CLOSED.
    """
    recruiter = create_recruiter()
    job = create_job(recruiter["recruiter_id"])

    requests.patch(f"{JOB_URL}/jobs/{job['job_id']}/close", timeout=TIMEOUT)
    resp = requests.patch(
        f"{JOB_URL}/jobs/{job['job_id']}/close", timeout=TIMEOUT
    )
    assert_error(resp, 409, "ALREADY_CLOSED")


# ── 9. KAFKA_UNAVAILABLE (message send) ───────────────────────────────────────

@pytest.mark.skipif(not service_up(MESSAGING_URL), reason="Messaging Service not reachable")
def test_failure_kafka_unavailable_on_message_send():
    """
    Sending a message when Kafka is down must return 503 KAFKA_UNAVAILABLE.

    Relies on a test/simulation endpoint on the Messaging Service.
    Skips if that endpoint is not yet implemented.
    """
    resp = requests.post(
        f"{MESSAGING_URL}/test/simulate-kafka-failure",
        json={"scenario": "message.sent"},
        timeout=TIMEOUT,
    )
    if resp.status_code == 404:
        pytest.skip("Kafka failure simulation endpoint not implemented")
    assert_error(resp, 503, "KAFKA_UNAVAILABLE")
