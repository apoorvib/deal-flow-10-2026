# SAVY implementation status

The frontend HTTP contract is wired through the active FastAPI app in `api/main.py`.

Implemented backend surfaces include:

- authenticated registration, login, logout, settings, and password changes;
- KYC, account-link, document ingestion, adviser and license lookups;
- all verification pathways, including accredited owners and registered adviser;
- deterministic decisions, passport issuance, shares, and invite-driven sharing;
- investor investments, funding-account state, and funding transitions;
- issuer overview, invitations, nudges, and platform integration state;
- public sales quote capture, admin showcase routes, PRISM tracing, Akta corroboration,
  Nicrron document review, Solari license lookup, and Roundtable artifacts.

Before a real launch, configure `DATABASE_URL`, apply `api/migrations/001_auth.sql`, set
`DEMO_MODE=live`, set `APP_ORIGIN` and `APP_ORIGINS` to the deployed frontend, enable
`COOKIE_SECURE=1`, and provide the server-side provider keys. The KYC, Plaid-style account
link, adviser lookup, and platform integration adapters are deterministic sandbox/state
implementations until their production providers and OAuth credentials are selected.

The current backend review was validated with Python compilation and `git diff --check`.
No tests were added or run in this pass.
