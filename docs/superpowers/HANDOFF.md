# Backend Handoff — Savy

**Status as of this file: Tasks 1, 2, and 5 are DONE and committed. Start at the fixtures, then Task 6.**

You are finishing the Python backend for an accredited-investor verification product called Savy. A React frontend is already built and working. Your job is to make the backend real, task by task, from an existing plan.

---

## 1. Read these before writing anything

In this order. Do not skip — the contract is fixed by the frontend and you cannot infer it.

| File | Why |
|---|---|
| `src/lib/types.ts` | **Authoritative wire contract.** Every field name and literal union. Never invent or rename a field. |
| `src/lib/api/mock.ts` | A complete working mock of the backend you are building. `fakeEvaluate()` is the behavior to replicate with real logic. |
| `src/lib/rules.ts` | Thresholds, and `estimateNetWorth()` — port that formula **verbatim**. |
| `src/lib/api/client.ts` | The 13 exact HTTP routes. |
| `docs/superpowers/specs/2026-10-24-accredited-investor-verification-design.md` | The design. Read §2 (contract), §4 (where each sponsor API plugs in), §5 (the evaluation engine), §6 (vision), §10 (security posture). |
| `docs/superpowers/plans/2026-10-24-accredited-investor-verification.md` | **Your task list**, with full test code. Each task has a time box and exact file paths. |
| `.superpowers/sdd/2026-10-24-accredited-investor-verification/progress.md` | The ledger: every decision made so far and why. |

---

## 2. What is already built — do not rebuild or refactor it

These are committed and have passed code review. **Treat them as fixed.** If you believe one is wrong, write a note in your report rather than changing it.

- **`api/models.py`** — Pydantic mirrors of every type in `src/lib/types.ts`. A shared `Base` sets `alias_generator=to_camel` and `populate_by_name=True`, so the wire is camelCase while Python stays snake_case. `DocType`, `Decision`, `CheckResult`, `Pathway`, `InvestorType` etc. all exist — **import them, never redefine them**.
- **`api/store.py`** — disk-backed JSON persistence: `put(collection, key, model)`, `get(collection, key, cls)`, `all_of(collection, cls)`, `delete(...)`. Files land in `fixtures/live/`. Generic over collection name, so `store.put("doc_reviews", id, model)` works with no change. It has a documented read-modify-write race with no locking — known, deferred, do not "fix" it.
- **`api/main.py`** — FastAPI app with all 13 routes, CORS, error handlers, and working passport issuance / funds / shares / lookup / sign-off (including an audit log). Later tasks replace route **bodies**; never change a signature.
- **`api/adapters/sandbox.py`** — KYC and account-link stubs honoring the `scenario` parameters.
- **`api/nicrron.py`** — Nicrron client: `complete_json(model, system, user, image_b64=None)`, `classify(...)`, and the model constants. (Verify this exists; it is Task 5. If it is missing, do Task 5 first.)

---

## 3. Hard rules — violating any of these breaks the product

1. **JSON on the wire is camelCase.** Always serialize with `by_alias=True`.
2. **Errors are `{"error": "message"}`** — never FastAPI's default `{"detail": ...}`.
3. **CORS is `allow_origins=["http://localhost:5173"]` with `allow_credentials=True`.** A wildcard origin is invalid when the client sends credentials, which this frontend does.
4. **Never add a field to a type defined in `src/lib/types.ts`.** If the backend needs to remember something the frontend does not need, put it in its own store collection. Two precedents already exist: `doc_reviews` (the AI adjudicator's recommendation) and `audit_log` (sign-off attribution). Follow that pattern.
5. **Do not add authentication.** It is an accepted non-goal — see spec §10. The frontend contract has no auth concept, and adding it would diverge from the contract. The security holes are documented deliberately.
6. **The challenger model must NOT be an OpenAI model.** Extractor is `openai/gpt-6-luna`, challenger is `anthropic/claude-sonnet-5`, adjudicator is `openai/gpt-6-astra`. Cross-vendor independence is the whole architectural claim: the same vendor twice shares its blind spots, so the adversarial review becomes a rubber stamp. A test asserts the vendors differ — it is guarding the architecture.
7. **Decisions are deterministic.** The AI reads documents and writes prose. It never decides whether someone is accredited. `decision` is computed from checks by escalation (worst check wins). An AI recommendation is an *input*, never the output.
8. **Confidence threshold is 0.9**, from `src/lib/rules.ts`. Documents below 0.9, or carrying any flag, escalate the verification to `review`.
9. **Never print an API key value.** Keys live in `.env` at the repo root. Load them; do not echo them.
10. **Do not modify anything under `src/`.** That is the frontend.
11. **Vision works on BOTH models — confirmed on a document image.** Do not re-litigate this. An earlier probe concluded luna's vision was unconfirmed by misreading `finish_reason: "length"` (that means the output budget ran out, not that the model is blind). A W-2 image test settled it: both models returned `$214,500.00` with `finish_reason: stop` inside a 16-token cap. Spec §6 has the table.

---

## 4. Keys and flags available right now

`.env` contains **`NICRRON_API_KEY`**, **`SOLARI_API_KEY`**, **`VISION_ENABLED=1`**, and **`DEMO_MODE=cached`**. See `.env.example` for what every variable does.

**Two flags that will waste your time if you forget them:**

- **`VISION_ENABLED`** — `api/nicrron.py` reads it at import and **defaults to OFF**, in which case `complete_json` *silently* drops the image and sends text only. It is set to `1` in `.env`, so it works — but if document images ever stop being read, check this first. It is the kind of bug that looks like "the model can't read images" when the image was never sent.
- **`DEMO_MODE`** — `cached` makes every external adapter serve a fixture, which is what lets the demo run with the network off. `live` attempts the real call and falls back to cache on failure. Build adapters so both paths work, and test the *fallback* deliberately, not just the happy path.

Also: `complete_json` hardcodes a `data:image/png;base64,` prefix, so `image_b64` must be **raw base64 of a PNG** with no data-URI prefix of its own. Generate PNG fixtures, not JPEG.

**Blocked until the human adds a key — skip these tasks and say so:**
- Task 3 (PRISM tracing) needs `PRISMTRACE_API_KEY`
- Task 10 (akta.pro) needs `AKTA_API_KEY`
- Task 12 (Roundtable) needs `ROUNDTABLE_API_KEY`

**`api/tracing.py` does not exist yet** because Task 3 is blocked. **Do not import `api.tracing`.** Where the plan tells you to wrap something in a PRISM span, instead capture the values a span would record (model name, token usage, outcome, inputs used) in local variables and leave a one-line comment marking where tracing attaches. Task 3 then adds it without restructuring your code.

---

## 5. Do the work in THIS order

The plan's task numbers are not the right execution order given what is done and what is blocked.

### Step A — Document fixtures FIRST (plan Task 13, step 1 only)

You cannot test the debate, the checks, or the decision engine without documents. Build these before Task 6. Every file starts with a line reading `SYNTHETIC SPECIMEN — NOT A REAL DOCUMENT`.

- **Case 1 (clean income):** 2024 W-2, 2025 W-2, and a 1040. Consistent employer across all three. All amounts comfortably above $200,000.
- **Case 4 (arithmetic forgery):** a bank statement with **two independent, stateable defects** — a closing balance that does not follow from opening + deposits − withdrawals, **and** a "statement generated" date that precedes the period it reports. This must be catchable from the numbers alone.
- **Case 5 (the showpiece — get this exactly right):** 2025 W-2 showing **$240,000**; 2024 W-2 showing **$185,000**; a 1040 showing total income **$212,000** against AGI **$185,000**. The application will self-report $240,000 for *both* prior years. The point is that models tend to approve this (by averaging the two years, or by reading "total income" instead of the 2024 figure) while the deterministic check fails it, because Rule 501(a)(6) requires the threshold in **each** of the two most recent years. $185,000 is 7.5% below $200,000, far enough from the line that it cannot be dismissed as a rounding case.

### Step B — Task 6: the adversarial debate (`api/debate.py`)

The biggest task. Four rounds over the investor's **whole document set at once**, not per document — a per-document challenger structurally cannot see "the W-2 employer does not match the 1040," which is one of its own named failure modes.

Output must populate `ParsedDocument` exactly as `src/lib/types.ts` defines it. Unresolved challenges become `flags[]`; the adjudicator's confidence becomes `confidence`. The contract already has a home for adversarial findings, which is why anything flagged or below 0.9 escalates to `review`.

Store the adjudicator's recommendation (`APPROVE` / `DENY` / `INSUFFICIENT`) via `store.put("doc_reviews", doc_id, ...)`. **Do not** add it to `ParsedDocument`.

Round 2's prompt must name specific failure modes — `misread_or_transposed_digits`, `wrong_field` (AGI vs total income vs wages), `stale_or_wrong_tax_year`, `cross_document_inconsistency`, `face_arithmetic_error`, `impossible_dates`, `unsupported_inference`, `signs_of_alteration`. A vague "review this" reliably returns "looks fine," which is worse than no review. Tell the challenger explicitly that an empty challenge list is the correct answer when the extraction is sound.

The plan has all eight unit tests written out. They stub the model calls — only the orchestration is deterministically testable.

**Time the debate on real fixtures.** If one run exceeds ~25 seconds, pre-seed the demo cases and plan to do one live run on stage rather than five.

### Step C — Task 7: deterministic checks (`api/checks.py`) — TDD, strict

Write the 18 tests from the plan first, watch them fail, then implement. Port `estimateNetWorth` from `src/lib/rules.ts` **verbatim**: the primary residence is excluded entirely, and its mortgage counts as a liability only to the extent it is underwater *or* was increased in the last 60 days — `liabilities + max(underwater, recentIncrease)`, **not a sum of both**. The frontend shows hints from the same formula, so any divergence is visible to the user.

Mirror `fakeEvaluate()`'s check ids exactly (`identity`, `sanctions`, `doc_{id}`, `pathway`, `income_{year}`, `assets_verified`, `liabilities`, `trust`, `attest`) and add two: `income_cross_check` and `entity_corroboration`.

`income_cross_check` is the demo's centerpiece: compare what the investor **self-reported** against what the documents **actually say**. The LP claims $240,000 for 2024; the debate read $185,000 off the W-2. That disagreement is a `warn`, which escalates to `review`. Its `detail` string must name **both** figures — that sentence is what gets read aloud on stage.

Put the statutory citation in `detail` for every pathway check.

### Step D — Task 8: decision engine (`api/decide.py`) — TDD, strict

11 tests in the plan. Escalation ranks `approved < review < needs_info < denied`, worst check wins. `warn` → `review`. A `fail` on identity/sanctions/document-coverage → `needs_info` (the LP can fix those). A `fail` on a pathway test → `denied`.

`assert_issue_guardrail` refuses to issue a passport when any check is `fail` or a conflict is unresolved. This is also the PRISM challenge deliverable, so keep it a clean, separately callable function.

### Step E — Task 11: wire the pipeline into `POST /verifications`

**Narrowed** — passport issuance, funds, shares, and lookup already work from Task 2. You are adding the real evaluation: load the KYC session, account link, and parsed documents **from the store** (never trust figures from the client), call Solari for the `license` pathway, run `run_checks`, then `decide`, set `conflict` from the stored adjudicator recommendation, and call `assert_issue_guardrail` before issuing.

### Step F — Task 9: Solari BrokerCheck (`api/adapters/solari.py`)

`SOLARI_API_KEY` is available. **Write the cache fixture first** — it is the demo's safety net. Honor `DEMO_MODE=cached` by returning cache immediately; on `live`, attempt the cloud browser with a hard timeout and fall back to cache on **any** exception. Preserve the contract that a CRD starting with `9` returns `found: false`. **Verify the fallback by running with a deliberately bogus key** — that matters more than the happy path.

### Step G — Task 13 (rest): seed script, then rehearse

`scripts/seed_demo.py` runs all five cases and prints `id | pathway | decision | conflict | flags`. Expected: case 1 `approved`, case 2 `approved`, cases 3/4/5 `review`, and **case 5 must show the contradiction**.

Then **the WiFi-down drill**: disconnect the network, set `DEMO_MODE=cached`, re-run the seed. Every case must still complete. **Any crash here is a P0** — fix it before anything else. This step is never cut.

### Step H — If keys arrive: Tasks 3 (PRISM), 10 (akta.pro), 12 (Roundtable)

PRISM first — it is a deep integration and its `DEALFLOW` credit only redeems *after* a first trace lands, so it has a sequential dependency inside its own signup.

For akta.pro: it holds **company data only** — no individual-level data at all, so it can **never** establish accredited status for a person. It produces one `Check` that can `warn`, never a `pass` on accreditation, and `detail` must say it is corroboration rather than verification.

### Step I — Task 14, only if everything above is done and rehearsed

The optional deterministic-parser cross-check. Skip it otherwise.

---

## 6. How to work

- **One task at a time. Commit after each**, with a conventional message (`feat(api): ...`).
- **Run the tests.** Where the plan says TDD, write the test first and watch it fail before implementing. A test that passes immediately is testing nothing.
- **Do not refactor code from earlier tasks.** It has been reviewed. Touching it re-opens settled questions and burns the clock.
- **Respect the time boxes.** Each task has one. When it expires, take the fallback named in spec §8 and move on. A working demo with three deep integrations beats a half-built one with five.
- **If you fall behind**, use the plan's **Cut Ladder** — cut from the top. Roundtable degrades to local JSON logging first; it costs nothing architecturally.
- **Never cut:** the deterministic checks (Task 7), the decision engine (Task 8), demo case 5, or the WiFi-down drill.
- **If something is genuinely ambiguous**, follow `src/lib/types.ts` and write down what you decided and why. Do not guess silently.

## 7. What the demo has to show

An investor uploads documents. Two AI models from different vendors extract and adversarially review them. A deterministic engine checks the Rule 501(a) arithmetic. When those two layers disagree — the models approve, the validator fails it on the $185,000 year — the case is held for human review and the contradiction is shown explicitly.

That disagreement is the product. Not the AI reading documents, which anyone can demo: the **auditable record** that two independent models and a statutory check were applied and what each concluded. Everything above exists to make that one moment real rather than claimed.
