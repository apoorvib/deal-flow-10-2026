# Ninoo notes

- Backend (backend/): run with `docker compose up -d --build` from backend/; needs backend/.env (copy .env.example, generate SAVY_FIELD_ENCRYPTION_KEY with Fernet.generate_key()). Docker Desktop pulls go through a slow proxy — pre-pull images in the background.
- audit_logs is append-only (ORM hooks + Postgres trigger block UPDATE/DELETE/TRUNCATE). Write audit rows only via models.append_audit_log() inside database.audit_session() so they survive main-transaction rollback. Resetting dev data requires `docker compose down -v`.
- Gotcha: SQLAlchemy DDL() strings are Python %-formatted — write literal % as %% (e.g. in plpgsql RAISE), including inside SQL comments.
