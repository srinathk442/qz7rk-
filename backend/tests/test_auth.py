from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app import auth
from tests.conftest import register


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_register_returns_token_for_new_user(anon_client):
    body = register(anon_client, email="  Trader@Example.com ")

    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "trader@example.com"
    me = anon_client.get("/api/auth/me", headers=bearer(body["access_token"]))
    assert me.json() == body["user"]


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


@pytest.mark.parametrize(
    "token",
    [
        "not-a-jwt",
        jwt.encode({"sub": "1"}, "some-other-secret", algorithm="HS256"),
        jwt.encode(
            {"sub": "1", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)}, auth.JWT_SECRET, algorithm="HS256"
        ),
    ],
    ids=["garbage", "wrong-secret", "expired"],
)
def test_me_rejects_invalid_tokens(anon_client, token):
    register(anon_client)

    assert anon_client.get("/api/auth/me", headers=bearer(token)).status_code == 401


def test_token_for_deleted_user_is_rejected(anon_client):
    token = jwt.encode({"sub": "999"}, auth.JWT_SECRET, algorithm="HS256")

    assert anon_client.get("/api/auth/me", headers=bearer(token)).status_code == 401
