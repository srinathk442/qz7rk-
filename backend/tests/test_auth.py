from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app import auth
from tests.conftest import login, register


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_register_creates_user_without_logging_in(anon_client):
    user = register(anon_client, email="  Trader@Example.com ")

    assert user == {"id": 1, "email": "trader@example.com"}
    me = anon_client.get("/api/auth/me", headers=bearer(login(anon_client)))
    assert me.json() == user


def test_register_rejects_duplicate_email_case_insensitively(anon_client):
    register(anon_client, email="trader@example.com")
    res = anon_client.post("/api/auth/register", json={"email": "TRADER@example.com", "password": "another-pass"})

    assert res.status_code == 409


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "not-an-email", "password": "correct-horse"},
        {"email": "trader@example.com", "password": "short"},
        {"email": "trader@example.com"},
    ],
)
def test_register_validates_input(anon_client, payload):
    assert anon_client.post("/api/auth/register", json=payload).status_code == 422


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ({"email": "trader@localhost", "password": "correct-horse"}, "Enter a valid email address"),
        ({"email": "trader@example.com", "password": "short"}, "Password must be 8 to 128 characters"),
        ({"email": "trader@example.com", "password": " " * 8}, "Password cannot be only spaces"),
    ],
)
def test_register_validation_messages_are_readable(anon_client, payload, message):
    res = anon_client.post("/api/auth/register", json=payload)

    assert res.status_code == 422
    assert message in res.json()["detail"][0]["msg"]


def test_password_is_not_stored_in_plain_text():
    stored = auth.hash_password("correct-horse")

    assert "correct-horse" not in stored
    assert auth.verify_password("correct-horse", stored)
    assert not auth.verify_password("wrong-horse", stored)
    assert stored != auth.hash_password("correct-horse")  # salted


def test_login_with_correct_password(anon_client):
    register(anon_client)
    res = anon_client.post("/api/auth/login", json={"email": "Trader@example.com", "password": "correct-horse"})

    assert res.status_code == 200
    assert res.json()["token_type"] == "bearer"
    assert anon_client.get("/api/auth/me", headers=bearer(res.json()["access_token"])).status_code == 200


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "trader@example.com", "password": "wrong-horse"},
        {"email": "nobody@example.com", "password": "correct-horse"},
    ],
)
def test_login_rejects_bad_credentials_with_same_message(anon_client, payload):
    register(anon_client)
    res = anon_client.post("/api/auth/login", json=payload)

    assert res.status_code == 401
    assert res.json()["detail"] == "Incorrect email or password"


def test_me_requires_token(anon_client):
    res = anon_client.get("/api/auth/me")

    assert res.status_code == 401
    assert res.headers["WWW-Authenticate"] == "Bearer"


def signed(**claims) -> str:
    return jwt.encode(claims, auth.JWT_SECRET, algorithm="HS256")


NOW = datetime.now(timezone.utc)
LATER = NOW + timedelta(hours=1)


@pytest.mark.parametrize(
    "token",
    [
        "not-a-jwt",
        jwt.encode({"sub": "1", "exp": LATER}, "some-other-secret", algorithm="HS256"),
        signed(sub="1", exp=NOW - timedelta(minutes=1)),
        signed(sub="1"),
        signed(exp=LATER),
        signed(sub="abc", exp=LATER),
    ],
    ids=["garbage", "wrong-secret", "expired", "no-expiry", "no-subject", "non-numeric-subject"],
)
def test_me_rejects_invalid_tokens(anon_client, token):
    register(anon_client)

    assert anon_client.get("/api/auth/me", headers=bearer(token)).status_code == 401


def test_token_issued_by_a_server_with_a_slightly_fast_clock_is_accepted(anon_client):
    register(anon_client)
    token = signed(sub="1", iat=datetime.now(timezone.utc) + timedelta(seconds=5), exp=LATER)

    assert anon_client.get("/api/auth/me", headers=bearer(token)).status_code == 200


def test_token_for_deleted_user_is_rejected(anon_client):
    token = signed(sub="999", exp=LATER)

    assert anon_client.get("/api/auth/me", headers=bearer(token)).status_code == 401


def fail_login(client, email="trader@example.com"):
    return client.post("/api/auth/login", json={"email": email, "password": "wrong-horse"})


def test_login_locks_out_after_repeated_failures(anon_client):
    register(anon_client)
    for _ in range(auth.MAX_FAILED_LOGINS):
        assert fail_login(anon_client).status_code == 401

    # Even the right password is refused until the lockout ends.
    res = anon_client.post("/api/auth/login", json={"email": "trader@example.com", "password": "correct-horse"})
    assert res.status_code == 429
    assert res.json()["detail"] == "Too many failed attempts. Try again in 15 minutes."
    assert 0 < int(res.headers["Retry-After"]) <= 15 * 60


def test_lockout_is_per_email_and_applies_to_unknown_emails(anon_client):
    register(anon_client)
    for _ in range(auth.MAX_FAILED_LOGINS):
        fail_login(anon_client, email="nobody@example.com")

    assert fail_login(anon_client, email="nobody@example.com").status_code == 429
    assert login(anon_client)  # a different email is unaffected


def test_successful_login_resets_failure_count(anon_client):
    register(anon_client)
    for _ in range(auth.MAX_FAILED_LOGINS - 1):
        fail_login(anon_client)
    login(anon_client)

    assert fail_login(anon_client).status_code == 401


def test_lockout_ends_after_window(anon_client, monkeypatch):
    register(anon_client)
    for _ in range(auth.MAX_FAILED_LOGINS):
        fail_login(anon_client)

    monkeypatch.setattr(auth, "LOCKOUT_WINDOW", timedelta(0))  # as if the window has passed
    assert login(anon_client)
