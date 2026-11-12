import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import models  # noqa: F401  (registers tables on Base)
from app.db.session import Base, get_db, get_session_factory
from app.main import app
from app.services.embeddings import HashEmbedder, get_embedder

# Set TEST_DATABASE_URL to run the whole suite against a real Postgres (with pgvector) instead
# of in-memory SQLite, e.g.  postgresql+psycopg://postgres:pw@localhost:5432/nexora_test
# WARNING: that database's tables are dropped and recreated for every test.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.fixture
def client():
    """A test client backed by a fresh database for every test."""
    if TEST_DATABASE_URL:
        engine = create_engine(TEST_DATABASE_URL)
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        Base.metadata.drop_all(engine)
    else:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # Background document processing opens its own session; point it at the test database.
    app.dependency_overrides[get_session_factory] = lambda: TestingSession
    # A fast, offline embedder, so tests never download the real model.
    app.dependency_overrides[get_embedder] = lambda: HashEmbedder()
    with TestClient(app) as c:
        c.session_factory = TestingSession  # lets tests inspect the database directly
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


def signup(client, email="owner@acme.com", org="Acme", name="Olivia Owner", password="supersecret1"):
    """Creates an account + organization and returns Authorization headers."""
    res = client.post(
        "/api/v1/auth/signup",
        json={"email": email, "password": password, "full_name": name, "organization_name": org},
    )
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def login(client, email, password):
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}