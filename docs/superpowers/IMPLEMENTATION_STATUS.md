# Backend implementation status

Updated 2026-10-24 after taking over the in-progress Ninoo work.

## Completed

- POST /documents now reads uploads, extracts text or PNG image data, runs the cached/live document debate, stores ParsedDocument, and persists the server-side review record.
- POST /verifications now loads KYC, linked accounts, and documents from server storage, runs the Solari/akta adapters where applicable, performs deterministic checks, compares against the case review, and issues a passport only through the guardrail.
- Review sign-off uses the pipeline guardrail and preserves the audit record.
- Passwordless auth routes used by the current client are implemented, with email/password register/login compatibility. Sessions and ownership use PostgreSQL when DATABASE_URL exists and a local SQLite file otherwise.
- Added dashboard and admin routes required by src/lib/api/client.ts, including persona switching, seeded demo cases, reset, investor investments, issuer overview, and nudges.
- Added scripts/seed_demo.py and seeded fixtures/cache/debates/ for all seven synthetic document fixtures. Run python scripts/seed_demo.py after changing fixture bytes.
- Updated api/migrations/001_auth.sql for admin roles, sign-in links, and admin session views.
- Added PRISM HTTP tracing with local JSONL fallback, including the passport-issuance guardrail call.
- Added Roundtable/local debate venues; every thread, round message, and version is written locally before an optional remote mirror through Roundtable's documented `write_file` tool API.
- Added live akta.pro company search, enrichment, and negative-news corroboration with fixture fallback.
- Added Solari evidence metadata and traced BrokerCheck lookups with screenshot/source fallback fields.

## Verification performed

- python -m compileall -q api scripts
- FastAPI import smoke check: app loaded with 31 routes.
- git diff --check

- Syntax/import checks were repeated after the live integration wiring; no unit tests were written or run.
- PRISM handshake returned 200; the application tracing path emitted live traces and the PRISM doctor reported `overall=connected`, `app_connected=true`, and `trace_normalized=done`.

No unit tests were written or run.

## Known integration choice

The existing frontend uses passwordless /auth/link and /auth/verify; those routes remain the primary UI contract. Email/password routes are available for the MVP auth extension. Admin access is open in the hackathon sandbox when ADMIN_EMAILS is unset and restricted when it is configured.
