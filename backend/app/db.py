"""User accounts database.

SQLite by default. Set DATABASE_URL to use another database, e.g. a hosted
Postgres for Vercel, where the filesystem does not persist between invocations.
"""

import os
from collections.abc import Iterator
from datetime import datetime, timezone
from functools import cache
from pathlib import Path

from sqlalchemy import DateTime, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        # Hosting providers hand out postgres:// URLs; SQLAlchemy needs the driver named.
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url.removeprefix(prefix)
        return url
    # On Vercel only /tmp is writable, and it is wiped on cold starts.
    directory = Path("/tmp") if os.environ.get("VERCEL") else Path(__file__).resolve().parent.parent
    return f"sqlite:///{(directory / 'users.db').as_posix()}"


DATABASE_URL = _database_url()

# FastAPI runs sync endpoints in a thread pool, so SQLite connections cross threads.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(engine)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


@cache
def _create_tables() -> None:
    # Done on first use rather than at startup: the Vercel entry point does not run lifespan hooks.
    Base.metadata.create_all(engine)


def get_db() -> Iterator[Session]:
    _create_tables()
    with SessionLocal() as session:
        yield session
