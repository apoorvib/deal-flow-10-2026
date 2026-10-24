"""Minimal app entry point for Phase 1: creates tables and exposes /health."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text

import models  # noqa: F401  (registers models on Base.metadata)
from database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Phase 1 only; Alembic migrations replace this later.
    Base.metadata.create_all(bind=engine)
    yield
    engine.dispose()


app = FastAPI(title="Savy API", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}
