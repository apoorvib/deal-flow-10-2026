# PostgreSQL migrations

Auth schema is currently managed via `001_auth.sql`.

To apply it to the Supabase project, use the Supabase SQL Editor or run `psql "$DATABASE_URL" -f api/migrations/001_auth.sql` from a trusted server/dev environment. `api.main` also runs idempotent `CREATE TABLE IF NOT EXISTS` statements on startup as a convenience for MVP development; the SQL file is the canonical schema.

For this FastAPI backend, copy the URI from Supabase Dashboard → Connect → Direct → Session pooler → URI. Supabase says session pooler is the IPv4 alternative to the direct endpoint, while still allowing persistent sessions; the transaction pooler is intended for stateless serverless functions. The backend enforces SSL and disables prepared statements for broad pooler compatibility. Put the URI in backend-only `DATABASE_URL`; never expose it to the browser or any `VITE_` variable. If you later confirm the deployed app host supports IPv6, Direct connection is also suitable for a persistent backend.
