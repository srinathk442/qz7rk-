"""Registration, login and JWT bearer authentication.

Tokens are stateless: logging out means the client discards its token, which
otherwise stays valid until it expires (JWT_TTL_HOURS).
"""

import hashlib
import hmac
import logging
import math
import os
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, StringConstraints, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import LoginFailure, User, get_db

ALGORITHM = "HS256"
TOKEN_TTL = timedelta(hours=float(os.environ.get("JWT_TTL_HOURS", 12)))
# Tokens are issued and checked by different serverless instances, whose clocks can differ slightly.
CLOCK_LEEWAY = timedelta(seconds=30)
# Anyone holding one token can guess HS256 secrets offline, so short ones are refused.
MIN_SECRET_LENGTH = 32

# After this many failed logins for an email within the window, further attempts are refused
# until the oldest of them ages out. Kept in the database: serverless instances share no memory.
MAX_FAILED_LOGINS = 5
LOCKOUT_WINDOW = timedelta(minutes=15)

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if secret:
        if len(secret) < MIN_SECRET_LENGTH:
            raise RuntimeError(
                f"JWT_SECRET must be at least {MIN_SECRET_LENGTH} characters; generate one with "
                '`python -c "import secrets; print(secrets.token_urlsafe(48))"`'
            )
        return secret
    if os.environ.get("VERCEL"):
        # Each serverless instance would pick its own secret and reject the others' tokens.
        raise RuntimeError("JWT_SECRET must be set on Vercel")
    logging.getLogger(__name__).warning("JWT_SECRET not set; using a random one, so tokens end on restart")
    return secrets.token_urlsafe(32)


JWT_SECRET = _jwt_secret()

# scrypt from the standard library: memory-hard, so no extra hashing dependency is needed.
_SCRYPT_PARAMS = {"n": 2**14, "r": 8, "p": 1}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT_PARAMS)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    _, salt, digest = stored.split("$")
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), **_SCRYPT_PARAMS)
    return hmac.compare_digest(candidate, bytes.fromhex(digest))


# Checked against when the email is unknown, so a login takes as long either way
# and response times do not reveal which emails are registered.
_DUMMY_HASH = hash_password(secrets.token_hex(16))


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user.id), "iat": now, "exp": now + TOKEN_TTL}, JWT_SECRET, algorithm=ALGORITHM)


Email = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=254)]


# Validation errors raised as ValueError reach the user as written, so they are full sentences.
class RegisterRequest(BaseModel):
    email: Email
    password: str

    @field_validator("email")
    @classmethod
    def _valid_email(cls, email: str) -> str:
        if not _EMAIL_PATTERN.match(email):
            raise ValueError("Enter a valid email address, like name@example.com")
        return email

    @field_validator("password")
    @classmethod
    def _valid_password(cls, password: str) -> str:
        if not PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH:
            raise ValueError(f"Password must be {PASSWORD_MIN_LENGTH} to {PASSWORD_MAX_LENGTH} characters")
        if not password.strip():
            raise ValueError("Password cannot be only spaces")
        return password


class LoginRequest(BaseModel):
    # No password rules here: a wrong password should get a 401, not a validation error.
    email: Email
    password: str


@dataclass(frozen=True)
class UserInfo:
    id: int
    email: str


@dataclass(frozen=True)
class Token:
    access_token: str
    token_type: str
    expires_in: int  # seconds
    user: UserInfo


def _token_response(user: User) -> Token:
    return Token(
        access_token=create_token(user),
        token_type="bearer",
        expires_in=int(TOKEN_TTL.total_seconds()),
        user=UserInfo(id=user.id, email=user.email),
    )


_bearer = HTTPBearer(auto_error=False)


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Dependency: the user named by a valid bearer token, otherwise 401."""

    def unauthorized(detail: str) -> HTTPException:
        return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})

    if credentials is None:
        raise unauthorized("Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[ALGORITHM],
            leeway=CLOCK_LEEWAY,
            options={"require": ["exp", "sub"]},
        )
        user_id = int(payload["sub"])
    except jwt.ExpiredSignatureError as exc:
        raise unauthorized("Your session expired, please log in again") from exc
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise unauthorized("Your session is no longer valid, please log in again") from exc

    user = db.get(User, user_id)
    if user is None:
        raise unauthorized("This account no longer exists")
    return user


router = APIRouter(prefix="/api/auth", tags=["auth"])


# Registering does not log the user in: they then log in with the new credentials.
@router.post("/register", response_model=UserInfo, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> UserInfo:
    user = User(email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="An account with this email already exists") from exc
    return UserInfo(id=user.id, email=user.email)


def _as_utc(dt: datetime) -> datetime:
    # SQLite returns naive datetimes; everything is stored in UTC.
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _refuse_if_locked_out(db: Session, email: str, now: datetime) -> None:
    """429 if `email` has had MAX_FAILED_LOGINS failures within the lockout window.

    Unknown emails are counted too, so a lockout does not reveal whether an account exists.
    """
    recent = db.scalars(
        select(LoginFailure.created_at)
        .where(LoginFailure.email == email, LoginFailure.created_at > now - LOCKOUT_WINDOW)
        .order_by(LoginFailure.created_at.desc())
        .limit(MAX_FAILED_LOGINS)
    ).all()
    if len(recent) < MAX_FAILED_LOGINS:
        return
    wait = math.ceil((_as_utc(recent[-1]) + LOCKOUT_WINDOW - now).total_seconds())
    minutes = max(1, math.ceil(wait / 60))
    raise HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Too many failed attempts. Try again in {minutes} minute{'' if minutes == 1 else 's'}.",
        headers={"Retry-After": str(max(1, wait))},
    )


@router.post("/login", response_model=Token)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> Token:
    now = datetime.now(timezone.utc)
    _refuse_if_locked_out(db, body.email, now)

    user = db.scalars(select(User).where(User.email == body.email)).first()
    if not verify_password(body.password, user.password_hash if user else _DUMMY_HASH) or user is None:
        db.add(LoginFailure(email=body.email, created_at=now))
        # Housekeeping: failures older than the window no longer count for anyone.
        db.execute(delete(LoginFailure).where(LoginFailure.created_at <= now - LOCKOUT_WINDOW))
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    db.execute(delete(LoginFailure).where(LoginFailure.email == body.email))
    db.commit()
    return _token_response(user)


@router.get("/me", response_model=UserInfo)
def me(user: User = Depends(current_user)) -> UserInfo:
    return UserInfo(id=user.id, email=user.email)
