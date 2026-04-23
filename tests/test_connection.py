"""
test_connection.py — Connection Service tests (port 8005)

Covers: request, accept, reject, list, already_connected, pending_request.
"""

import pytest
import requests

from conftest import (
    CONNECTION_URL, TIMEOUT,
    assert_success, assert_error,
    create_member, requires_connection,
)


def request_connection(from_id: str, to_id: str) -> requests.Response:
    return requests.post(f"{CONNECTION_URL}/connections", json={
        "requested_by": from_id,
        "user_a": from_id,
        "user_b": to_id,
    }, timeout=TIMEOUT)


def get_connection_id(from_id: str, to_id: str) -> str:
    resp = request_connection(from_id, to_id)
    return resp.json().get("data", {}).get("connection_id")


@requires_connection
class TestRequestConnection:
    def test_request_returns_201(self):
        a = create_member()
        b = create_member()
        resp = request_connection(a["member_id"], b["member_id"])
        data = assert_success(resp, 201)
        assert "connection_id" in data
        assert data["status"] == "pending"

    def test_request_missing_user_b_returns_400(self):
        a = create_member()
        resp = requests.post(f"{CONNECTION_URL}/connections", json={
            "requested_by": a["member_id"],
            "user_a": a["member_id"],
        }, timeout=TIMEOUT)
        assert resp.status_code == 400

    def test_self_connection_returns_400(self):
        a = create_member()
        resp = request_connection(a["member_id"], a["member_id"])
        assert resp.status_code == 400

    def test_duplicate_pending_request_returns_409(self):
        a = create_member()
        b = create_member()
        request_connection(a["member_id"], b["member_id"])
        resp = request_connection(a["member_id"], b["member_id"])
        assert_error(resp, 409, "DUPLICATE_CONNECTION")

    def test_already_connected_returns_409(self):
        a = create_member()
        b = create_member()
        conn_id = get_connection_id(a["member_id"], b["member_id"])
        # Accept the connection
        requests.patch(
            f"{CONNECTION_URL}/connections/{conn_id}/accept", timeout=TIMEOUT
        )
        # Try to connect again
        resp = request_connection(a["member_id"], b["member_id"])
        assert_error(resp, 409, "ALREADY_CONNECTED")


@requires_connection
class TestAcceptConnection:
    def test_accept_pending_connection(self):
        a = create_member()
        b = create_member()
        conn_id = get_connection_id(a["member_id"], b["member_id"])

        resp = requests.patch(
            f"{CONNECTION_URL}/connections/{conn_id}/accept", timeout=TIMEOUT
        )
        data = assert_success(resp, 200)
        assert data["status"] == "accepted"

    def test_accept_nonexistent_connection_returns_404(self):
        resp = requests.patch(
            f"{CONNECTION_URL}/connections/00000000-0000-0000-0000-000000000000/accept",
            timeout=TIMEOUT,
        )
        assert_error(resp, 404, "NOT_FOUND")

    def test_accept_already_accepted_is_idempotent_or_409(self):
        a = create_member()
        b = create_member()
        conn_id = get_connection_id(a["member_id"], b["member_id"])
        requests.patch(
            f"{CONNECTION_URL}/connections/{conn_id}/accept", timeout=TIMEOUT
        )
        resp = requests.patch(
            f"{CONNECTION_URL}/connections/{conn_id}/accept", timeout=TIMEOUT
        )
        # Either 200 (idempotent) or 409 (already accepted) is acceptable
        assert resp.status_code in (200, 409)


@requires_connection
class TestRejectConnection:
    def test_reject_pending_connection(self):
        a = create_member()
        b = create_member()
        conn_id = get_connection_id(a["member_id"], b["member_id"])

        resp = requests.patch(
            f"{CONNECTION_URL}/connections/{conn_id}/reject", timeout=TIMEOUT
        )
        data = assert_success(resp, 200)
        assert data["status"] == "rejected"

    def test_reject_nonexistent_connection_returns_404(self):
        resp = requests.patch(
            f"{CONNECTION_URL}/connections/00000000-0000-0000-0000-000000000000/reject",
            timeout=TIMEOUT,
        )
        assert_error(resp, 404, "NOT_FOUND")


@requires_connection
class TestListConnections:
    def test_list_connections_by_user(self):
        a = create_member()
        b = create_member()
        request_connection(a["member_id"], b["member_id"])

        resp = requests.get(
            f"{CONNECTION_URL}/connections",
            params={"user_id": a["member_id"]},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", data)
        assert len(items) >= 1

    def test_list_connections_filter_by_status(self):
        a = create_member()
        b = create_member()
        conn_id = get_connection_id(a["member_id"], b["member_id"])
        requests.patch(
            f"{CONNECTION_URL}/connections/{conn_id}/accept", timeout=TIMEOUT
        )

        resp = requests.get(
            f"{CONNECTION_URL}/connections",
            params={"user_id": a["member_id"], "status": "accepted"},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", data)
        assert all(c["status"] == "accepted" for c in items)

    def test_list_connections_unknown_user_returns_empty(self):
        resp = requests.get(
            f"{CONNECTION_URL}/connections",
            params={"user_id": "00000000-0000-0000-0000-000000000000"},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", [])
        assert items == []
