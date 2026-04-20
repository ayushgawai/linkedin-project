"""
test_profile.py — Profile Service tests (port 8001)

Covers: create, get, update, delete, search, duplicate email,
        missing fields, pagination.
"""

import pytest
import requests

from conftest import (
    PROFILE_URL, TIMEOUT,
    assert_success, assert_error,
    create_member, unique_email, requires_profile,
)


@requires_profile
class TestCreateMember:
    def test_create_returns_201(self):
        resp = requests.post(f"{PROFILE_URL}/members", json={
            "first_name": "Alice",
            "last_name": "Smith",
            "email": unique_email(),
            "headline": "Engineer",
        }, timeout=TIMEOUT)
        data = assert_success(resp, 201)
        assert "member_id" in data
        assert data["first_name"] == "Alice"

    def test_create_missing_first_name_returns_400(self):
        resp = requests.post(f"{PROFILE_URL}/members", json={
            "last_name": "Smith",
            "email": unique_email(),
        }, timeout=TIMEOUT)
        assert resp.status_code == 400

    def test_create_missing_last_name_returns_400(self):
        resp = requests.post(f"{PROFILE_URL}/members", json={
            "first_name": "Alice",
            "email": unique_email(),
        }, timeout=TIMEOUT)
        assert resp.status_code == 400

    def test_create_missing_email_returns_400(self):
        resp = requests.post(f"{PROFILE_URL}/members", json={
            "first_name": "Alice",
            "last_name": "Smith",
        }, timeout=TIMEOUT)
        assert resp.status_code == 400

    def test_duplicate_email_returns_409(self):
        email = unique_email()
        create_member(email=email)
        resp = requests.post(f"{PROFILE_URL}/members", json={
            "first_name": "Bob",
            "last_name": "Jones",
            "email": email,
        }, timeout=TIMEOUT)
        assert_error(resp, 409, "DUPLICATE_EMAIL")


@requires_profile
class TestGetMember:
    def test_get_existing_member(self):
        member = create_member()
        resp = requests.get(
            f"{PROFILE_URL}/members/{member['member_id']}", timeout=TIMEOUT
        )
        data = assert_success(resp, 200)
        assert data["member_id"] == member["member_id"]
        assert data["email"] == member["email"]

    def test_get_nonexistent_member_returns_404(self):
        resp = requests.get(
            f"{PROFILE_URL}/members/00000000-0000-0000-0000-000000000000",
            timeout=TIMEOUT,
        )
        assert_error(resp, 404, "NOT_FOUND")


@requires_profile
class TestUpdateMember:
    def test_update_headline(self):
        member = create_member()
        resp = requests.put(
            f"{PROFILE_URL}/members/{member['member_id']}",
            json={"headline": "Senior Engineer"},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        assert data["headline"] == "Senior Engineer"

    def test_update_about(self):
        member = create_member()
        resp = requests.put(
            f"{PROFILE_URL}/members/{member['member_id']}",
            json={"about": "Updated bio text."},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        assert data["about"] == "Updated bio text."

    def test_update_nonexistent_returns_404(self):
        resp = requests.put(
            f"{PROFILE_URL}/members/00000000-0000-0000-0000-000000000000",
            json={"headline": "Ghost"},
            timeout=TIMEOUT,
        )
        assert_error(resp, 404, "NOT_FOUND")


@requires_profile
class TestDeleteMember:
    def test_delete_existing_member(self):
        member = create_member()
        resp = requests.delete(
            f"{PROFILE_URL}/members/{member['member_id']}", timeout=TIMEOUT
        )
        assert resp.status_code in (200, 204)

    def test_deleted_member_returns_404_on_get(self):
        member = create_member()
        requests.delete(
            f"{PROFILE_URL}/members/{member['member_id']}", timeout=TIMEOUT
        )
        resp = requests.get(
            f"{PROFILE_URL}/members/{member['member_id']}", timeout=TIMEOUT
        )
        assert_error(resp, 404, "NOT_FOUND")

    def test_delete_nonexistent_returns_404(self):
        resp = requests.delete(
            f"{PROFILE_URL}/members/00000000-0000-0000-0000-000000000000",
            timeout=TIMEOUT,
        )
        assert_error(resp, 404, "NOT_FOUND")


@requires_profile
class TestSearchMembers:
    def test_search_returns_list(self):
        resp = requests.get(
            f"{PROFILE_URL}/members/search", params={"q": "Engineer"}, timeout=TIMEOUT
        )
        data = assert_success(resp, 200)
        assert isinstance(data, list) or isinstance(data.get("items"), list)

    def test_search_empty_query_returns_400_or_results(self):
        resp = requests.get(f"{PROFILE_URL}/members/search", timeout=TIMEOUT)
        assert resp.status_code in (200, 400)

    def test_search_no_results_returns_empty_list(self):
        resp = requests.get(
            f"{PROFILE_URL}/members/search",
            params={"q": "xyzzy_no_match_9999"},
            timeout=TIMEOUT,
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", [])
        assert items == []


@requires_profile
class TestPagination:
    def test_list_members_default_page(self):
        resp = requests.get(f"{PROFILE_URL}/members", timeout=TIMEOUT)
        data = assert_success(resp, 200)
        assert isinstance(data, (list, dict))

    def test_list_members_with_limit(self):
        resp = requests.get(
            f"{PROFILE_URL}/members", params={"page": 1, "limit": 5}, timeout=TIMEOUT
        )
        data = assert_success(resp, 200)
        items = data if isinstance(data, list) else data.get("items", data)
        assert len(items) <= 5

    def test_list_members_page_2(self):
        resp = requests.get(
            f"{PROFILE_URL}/members", params={"page": 2, "limit": 5}, timeout=TIMEOUT
        )
        assert resp.status_code == 200
