# Assumptions — Savy backend

Decisions made where the handoff, plan, spec, and `src/lib/types.ts` were silent or in conflict.
`src/lib/types.ts` wins every conflict. Each line says what we assumed and why. Revisit any of
these if they turn out wrong; none are load-bearing beyond what is stated.

Priority rule (from the user): **a bug-free, working product first; optimization and polish later.**

## Contract

- **A1. There is no `conflict` field on the wire.** `Verification` in `types.ts` has none, and we
  never add fields. Agent-vs-validator disagreement is surfaced as a normal `Check`
  (id `agent_validator_conflict`, result `warn`, detail naming both sides) so the existing UI
  renders it with no frontend change. A copy goes in the `case_reviews` store collection for the
  audit trail. The seed script reads the conflict from that check, not from a `conflict` field.
- **A2. `Verification.input` is always a real `ApplicationInput`.** Tests that need a Verification
  build a minimal valid input; the model is never relaxed to allow `None`.

## Documents and the debate

- **A3. Two-stage review.** `POST /documents` gets one file and does not know the rest of the set,
  so the 4-round debate (extract → challenge → respond → adjudicate) runs **per document at
  upload**, producing the `ParsedDocument`. At `POST /verifications`, a **case-level review** call
  sees all referenced documents together and returns cross-document inconsistencies plus an
  overall `APPROVE | DENY | INSUFFICIENT` recommendation. This satisfies both "parse at upload"
  (spec §3) and "the challenger sees the whole set" (handoff).
- **A4. The adjudicator's recommendation is case-level.** A single W-2 cannot be "accredited", and
  the per-document adjudicator is told not to apply dollar thresholds. So `detect_conflict` uses
  the case-level recommendation from A3, stored in `case_reviews` keyed by verification id.
  The per-document adjudication goes to `doc_reviews` keyed by document id (as the ledger ruled).
- **A5. Case-level review never decides.** Its recommendation feeds `detect_conflict` only;
  `decision` is computed from checks. Its cross-document findings become a `warn` check
  (`cross_document`) when non-empty.
- **A6. The demo's reliable catch is `income_cross_check`, not model error.** Case 5 must reach
  `review` on every run. The deterministic cross-check (self-reported vs extracted) guarantees
  that; agent-vs-validator conflict is shown when it occurs, never relied on.
- **A7. File handling.** The UI accepts PDF, PNG, JPEG.
  - PNG → sent as-is; JPEG → re-encoded to PNG with Pillow (since `complete_json` hardcodes a PNG
    data URI); PDF → text extracted with `pypdf` and sent as text (no page render; PyMuPDF is not
    installed). Text files are also accepted for scripts/tests.
  - Unreadable/empty input → a `ParsedDocument` with `docType="other"`, `confidence=0`, and a flag,
    rather than a 500. The upload must never crash the UI.
- **A8. Any model failure degrades, never crashes.** If a debate round errors or returns
  unparseable JSON, the document is returned with low confidence and a flag
  ("Automated review incomplete"), which escalates to `review`. A human reviewer is the safe
  fallback; a 500 is not.
- **A9. Offline demo = cache keyed by file content.** Debate results are cached under
  `fixtures/cache/debates/` keyed by SHA-256 of the file bytes. `DEMO_MODE=cached` serves the cache
  and makes no model call; on a cache miss it returns the A8 degraded result rather than calling
  out. `DEMO_MODE=live` calls the models and writes the cache. The same applies to the case-level
  review (keyed by the sorted document hashes + self-reported figures).
  The rehearsal seeds the cache online before the WiFi-down drill.
- **A10. Holder hint.** `uploadDocument(file, holderHint)` never sends the hint over HTTP
  (`client.ts` only appends `file`). The backend therefore has no holder hint; `holderName` comes
  from extraction or is `null`.
- **A11. Classification.** Document type comes from `classify()` (Task 5), then the debate fills the
  fields. If classification fails, `docType="other"`.

## Income rules

- **A12. Tax years.** "The last two years" = calendar `now.year - 2` (`priorYear2`) and
  `now.year - 1` (`priorYear1`), matching `fakeEvaluate()` and `evidence.tsx`. Today (2026) that is
  2024 and 2025, which matches the case 5 fixtures.
- **A13. Documented income per year** = AGI from a 1040 for that year if present; otherwise the sum
  of W-2 / K-1 `income` values for that year. `ParsedDocument.income` already holds AGI for 1040s
  (types.ts comment), so we use that field, never "total income".
- **A14. Cross-check tolerance.** Self-reported vs documented differ "materially" when the gap is
  more than **5% or $5,000, whichever is larger**. Smaller gaps pass (rounding, bonuses).
  `detail` always names both figures. Years with no document are handled by `income_{year}`
  coverage, not by the cross-check.
- **A15. Income checks run even when the self-reported pathway fails**, so a denied case still
  explains why. (The mock skips coverage on a pathway fail; we keep its check ids but always emit
  them.)

## Decisions

- **A16. Escalation map.** `warn` → `review`. `fail` on `identity`, `sanctions`, `income_{year}`,
  `attest` → `needs_info` (fixable by the LP). `fail` on `pathway` → `denied`, except the
  `min_investment` pathway fail → `needs_info`, matching `fakeEvaluate()`.
- **A17. Reasons** use the mock's plain-language strings where the mock has them, deduplicated,
  order preserved, and empty when approved.
- **A18. Guardrail** raises (refuses to issue) when any check is `fail`, or when an
  `agent_validator_conflict` check is present and the case has not been signed off by a human.
  Human sign-off of a `review` case is the resolution of a conflict, so sign-off may still issue.

## Integrations

- **A19. Solari.** Standard browser session only (stealth needs a paid plan, HTTP 402). Live path
  uses a hard timeout (20 s) and falls back to cache on any exception. A CRD starting with `9`
  returns `found: false` in every mode. Screenshots are written under `fixtures/cache/screenshots/`.
  Without a real consenting CRD, case 2 uses a cached fixture plus a clearly synthetic CRD;
  the live search is demonstrated only when the team supplies a CRD.
- **A20. Solari from Python.** The SDK is Node (`@solarisdk/browser`). The Python adapter calls a
  small Node script via subprocess with a timeout, rather than reimplementing the session API.
- **A21. Blocked keys (PRISM, akta.pro, Roundtable).** Not built tonight unless keys arrive.
  Where tracing would go, code leaves a one-line `# PRISM span:` comment and never imports
  `api.tracing`. Entity corroboration uses a cached fixture behind the same interface (A22).
- **A22. akta.pro fixture only.** Entity cases read `fixtures/cache/entities.json`; the check is
  `pass`/`warn` on corroboration quality and never claims to verify accreditation.

## Environment

- **A23. Python runtime** is the Windows miniforge interpreter
  (`/mnt/c/Users/Apoorv/miniforge3/python.exe`, Python 3.13); WSL `python3` has no deps.
  Tests: `$PY -m pytest -q`. `pypdf` and Pillow are present there; add both to `requirements.txt`.
- **A24. Store working directory.** `api/store.py` writes to the relative `fixtures/live`, so the
  server and scripts must run from the repo root. Not changed (settled code).
