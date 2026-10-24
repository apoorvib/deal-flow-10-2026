# Ninoo notes

- Backend (backend/): run with `docker compose up -d --build` from backend/; needs backend/.env (copy .env.example, generate SAVY_FIELD_ENCRYPTION_KEY with Fernet.generate_key()). Docker Desktop pulls go through a slow proxy — pre-pull images in the background.
- audit_logs is append-only (ORM hooks + Postgres trigger block UPDATE/DELETE/TRUNCATE). Write audit rows only via models.append_audit_log() inside database.audit_session() so they survive main-transaction rollback. Resetting dev data requires `docker compose down -v`.
- Gotcha: SQLAlchemy DDL() strings are Python %-formatted — write literal % as %% (e.g. in plpgsql RAISE), including inside SQL comments.
- Run backend tests (from backend/): `docker compose run --rm --no-deps -v "$PWD":/src -w /src web python -m pytest tests/` — tests/ is dockerignored, so it must be mounted. conftest uses an isolated <db>_test database (dropped/recreated each session) and refuses non-_test DBs.
