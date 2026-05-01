"""
test_messaging.py — Messaging Service tests (port 8004)

Covers: open thread (idempotent), get thread, list messages,
        send message, byUser, thread_not_found.
"""

import pytest
import requests

from conftest import (
    MESSAGING_URL, TIMEOUT,
    assert_success, assert_error,
    create_member, requires_messaging,
)


def open_thread(user_a: str, user_b: str) -> requests.Response:
    return requests.post(f"{MESSAGING_URL}/threads", json={
        "participants": [user_a, user_b],
    }, timeout=TIMEOUT)


def send_message(thread_id: str, sender_id: str, text: str) -> requests.Response:
    return requests.post(
        f"{MESSAGING_URL}/threads/{thread_id}/messages",
        json={"sender_id": sender_id, "message_text": text},
        timeout=TIMEOUT,
    )


@requires_messaging
class TestOpenThread:
    def test_open_thread_returns_201_or_200(self):
        a = create_member()
        b = create_member()
        resp = open_thread(a["member_id"], b["member_id"])
        assert resp.status_code in (200, 201)
        body = resp.json()
        assert body.get("success") is True
        data = body.get("data", body)
        assert "thread_id" in data

    def test_open_thread_is_idempotent(self):
        """Opening the same thread twice should return the same thread_id."""
        a = create_member()
        b = create_member()
        resp1 = open_thread(a["member_id"], b["member_id"])
        resp2 = open_thread(a["member_id"], b["member_id"])
        assert resp1.status_code in (200, 201)
        assert resp2.status_code in (200, 201)
        tid1 = resp1.json().get("data", {}).get("thread_id")
        tid2 = resp2.json().get("data", {}).get("thread_id")
        assert tid1 == tid2, "Idempotent call must return the same thread_id"

    def test_open_thread_reversed_participants_is_idempotent(self):
        """Order of participants should not create a duplicate thread."""
        a = create_member()
        b = create_member()
        resp1 = open_thread(a["member_id"], b["member_id"])
        resp2 = open_thread(b["member_id"], a["member_id"])
        tid1 = resp1.json().get("data", {}).get("thread_id")
        tid2 = resp2.json().get("data", {}).get("thread_id")
        assert tid1 == tid2

    def test_open_thread_missing_participants_returns_400(self):
        resp = requests.post(f"{MESSAGING_URL}/threads", json={}, timeout=TIMEOUT)
        assert resp.status_code == 400

    def test_open_thread_single_participant_returns_400(self):
        a = create_member()
        resp = requests.post(
            f"{MESSAGING_URL}/threads",
            json={"participants": [a["member_id"]]},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 400


@requires_messaging
class TestGetThread:
    def test_get_existing_thread(self):
        a = create_member()
        b = create_member()
        resp = open_thread(a["member_id"], b["member_id"])
        tid = resp.json()["data"]["thread_id"]

        resp2 = requests.get(f"{MESSAGING_URL}/threads/{tid}", timeout=TIMEOUT)
        data = assert_success(resp2, 200)
        assert data["thread_id"] == tid

    def test_get_nonexistent_thread_returns_404(self):
        resp = requests.get(
            f"{MESSAGING_URL}/threads/00000000-0000-0000-0000-000000000000",
            timeout=TIMEOUT,
        )
        assert_error(resp, 404, "NOT_FOUND")


@requires_messaging
class TestListMessages:
    def test_list_messages_empty_thread(self):
        a = create_member()
        b = create_member()
        resp = open_thread(a["member_id"], b["member_id"])
        tid = resp.json()["data"]["thread_id"]

        resp2 = requests.get(
            f"{MESSAGING_URL}/threads/{tid}/messages", timeout=TIMEOUT
        )
        data = assert_success(resp2, 200)
        items = data if isinstance(data, list) else data.get("items", data)
        assert isinstance(items, list)

    def test_list_messages_after_send(self):
        a = create_member()
        b = create_member()
        resp = open_thread(a["member_id"], b["member_id"])
        tid = resp.json()["data"]["thread_id"]
        send_message(tid, a["member_id"], "Hello!")

        resp2 = requests.get(
            f"{MESSAGING_URL}/threads/{tid}/messages", timeout=TIMEOUT
        )
        data = assert_success(resp2, 200)
        items = data if isinstance(data, list) else data.get("items", data)
        assert len(items) >= 1

    def test_list_messages_nonexistent_thread_returns_404(self):
        resp = requests.get(
            f"{MESSAGING_URL}/threads/00000000-0000-0000-0000-000000000000/messages",
            timeout=TIMEOUT,
        )
        assert_error(resp, 404, "NOT_FOUND")


@requires_messaging
class TestSendMessage:
    def test_send_message_returns_201(self):
        a = create_member()
        b = create_member()
        resp = open_thread(a["member_id"], b["member_id"])
        tid = resp.json()["data"]["thread_id"]

        resp2 = send_message(tid, a["member_id"], "Hey, interested in the role!")
        data = assert_success(resp2, 201)
        assert "message_id" in data
        assert data["message_text"] == "Hey, interested in the role!"

    def test_send_message_missing_text_returns_400(self):
        a = create_member()
        b = create_member()
        resp = open_thread(a["member_id"], b["member_id"])
        tid = resp.json()["data"]["thread_id"]

        resp2 = requests.post(
            f"{MESSAGING_URL}/threads/{tid}/messages",
            json={"sender_id": a["member_id"]},
            timeout=TIMEOUT,
        )
        assert resp2.status_code == 400

    def test_send_message_to_nonexistent_thread_returns_404(self):
        a = create_member()
        resp = send_message(
            "00000000-0000-0000-0000-000000000000",
            a["member_id"],
            "Hello?",
        )
        assert_error(resp, 404, "NOT_FOUND")


@requires_messaging
class TestThreadsByUser:
    def test_list_threads_by_user(self):
        a = create_member()
        b = create_member()
        open_thread(a["member_id"], b["member_id"])

        resp = requests.get(
            f"{MESSAGING_URL}/threads",
            params={"user_id": a["member_id"]},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", data)
        assert len(items) >= 1

    def test_list_threads_unknown_user_returns_empty(self):
        resp = requests.get(
            f"{MESSAGING_URL}/threads",
            params={"user_id": "00000000-0000-0000-0000-000000000000"},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", [])
        assert items == []
