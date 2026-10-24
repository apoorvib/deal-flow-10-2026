"""Pytest fixtures: every test runs against a separate, throwaway Postgres database.

The test database is derived from DATABASE_URL by appending "_test" to the name
(or set TEST_DATABASE_URL). It is dropped and recreated once per session, and all
tables are dropped and recreated before each test. audit_logs can't be truncated
by design, so per-test DROP/CREATE is the only way to isolate tests.

DATABASE_URL is overridden *before* database.py is imported, so the app's engine
can never point at the real database during tests.
"""

import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

_base_url = os.environ.get("DATABASE_URL")
if not _base_url and not os.environ.get("TEST_DATABASE_URL"):
    raise RuntimeError("Set DATABASE_URL or TEST_DATABASE_URL to run the tests")

TEST_URL = make_url(
    os.environ.get("TEST_DATABASE_URL")
    or make_url(_base_url).set(database=f"{make_url(_base_url).database}_test").render_as_string(
        hide_password=False
    )
)

# Hard guard: never run destructive fixtures against a non-test database.
if not TEST_URL.database.endswith("_test"):
    raise RuntimeError(f"Refusing to run tests against non-test database {TEST_URL.database!r}")

os.environ["DATABASE_URL"] = TEST_URL.render_as_string(hide_password=False)
if not os.environ.get("SAVY_FIELD_ENCRYPTION_KEY"):
    from cryptography.fernet import Fernet

    os.environ["SAVY_FIELD_ENCRYPTION_KEY"] = Fernet.generate_key().decode()


def _recreate_test_database() -> None:
    admin = create_engine(TEST_URL.set(database="postgres"), isolation_level="AUTOCOMMIT")
    name = TEST_URL.database
    with admin.connect() as conn:
        conn.execute(
            text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = :n AND pid <> pg_backend_pid()"
            ),
            {"n": name},
        )
        conn.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    admin.dispose()


_recreate_test_database()

import database  # noqa: E402  (must come after DATABASE_URL is overridden)
import models  # noqa: E402,F401  (registers tables and the audit trigger DDL)


@pytest.fixture(scope="session")
def engine():
    assert database.engine.url.database == TEST_URL.database
    yield database.engine
    database.engine.dispose()


@pytest.fixture(autouse=True)
def fresh_schema(engine):
    """Drop and recreate every table (and the audit trigger) before each test."""
    database.Base.metadata.drop_all(engine)
    database.Base.metadata.create_all(engine)
    yield


@pytest.fixture
def db():
    session = database.SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
