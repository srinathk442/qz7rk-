import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.db import Base, get_db


@pytest.fixture
def anon_client():
    """API client with a fresh in-memory user database and no login."""
    # StaticPool: every session shares the one connection, which holds the in-memory database.
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine)

    def override_get_db():
        with sessions() as session:
            yield session

    main.app.dependency_overrides[get_db] = override_get_db
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()
    engine.dispose()


def register(client: TestClient, email: str = "trader@example.com", password: str = "correct-horse") -> dict:
    res = client.post("/api/auth/register", json={"email": email, "password": password})
    assert res.status_code == 201, res.text
    return res.json()
