# Savy Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python backend the existing Savy React frontend already expects, where two AI models from different vendors adversarially review uploaded documents and a deterministic engine makes every statutory decision.

**Architecture:** FastAPI service exposing the 13 routes in `src/lib/api/client.ts`. Documents are parsed at upload via a 4-round cross-vendor debate (Nicrron). Verification runs deterministic Rule 501(a) checks, escalates on the worst check, and issues a 90-day passport. PRISM traces everything; Roundtable hosts the debate and versions the case file; Solari does BrokerCheck; akta.pro corroborates entities.

**Spec:** [`../specs/2026-10-24-accredited-investor-verification-design.md`](../specs/2026-10-24-accredited-investor-verification-design.md)

## MANDATORY READING before any task

Every implementer must read these first. The contract is **fixed by the frontend**; the backend conforms to it.

1. **`src/lib/types.ts`** — authoritative wire types. Never invent a field name.
2. **`src/lib/api/mock.ts`** — a complete working reference implementation. `fakeEvaluate()` is the behavior to replicate with real logic.
3. **`src/lib/rules.ts`** — thresholds and `estimateNetWorth()`. Port that formula verbatim.
4. **`src/lib/api/client.ts`** — routes.
5. The spec, §2 and §4.

## Global Constraints

- **Judging tonight.** Every task is time-boxed. When a box expires, take the fallback and move on. See the **Cut Ladder**.
- **JSON is camelCase.** Pydantic: `model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)` and always serialize with `by_alias=True`.
- **Errors are `{"error": "..."}`**, not FastAPI's default `{"detail": ...}`. Install an exception handler in Task 2.
- **CORS:** `allow_origins=["http://localhost:5173"]`, `allow_credentials=True`. A wildcard origin is rejected by browsers when credentials are included.
- **`reviewConfidence = 0.9`.** Confidence below 0.9, or any flag, escalates to `review`.
- **Passport validity and freshness: 90 days.**
- **Model IDs, exact:** extractor/classifier `openai/gpt-6-luna`, challenger `anthropic/claude-sonnet-5`, adjudicator `openai/gpt-6-astra`. The challenger **must not** be an OpenAI model — cross-vendor independence is the design's core claim.
- **Nicrron base URL:** `https://api.nicrron.ai/v1`
- **Vision is confirmed working** (probe, 2026-10-24 — see spec §6). `VISION_ENABLED=1`. The catalog's `modality: chat` label is wrong; both luna and Sonnet 5 read a base64 PNG correctly. `signs_of_alteration` stays in the challenger's failure modes.
- **Decisions are deterministic.** An AI recommendation is an input; it never writes `decision`.
- **Sandbox behavior is contract:** `scenario` on `/kyc` (`clean|ofac|fail`) and `/account-links` (`high|low`); CRD starting with `9` → `found: false`.
- **Every external call is cached.** The demo must run with WiFi off.
- **Never bind a real person's real records to synthetic financials.**
- **Env:** `NICRRON_API_KEY`, `PRISMTRACE_API_KEY`, `ROUNDTABLE_API_KEY`, `AKTA_API_KEY`, `SOLARI_API_KEY`, `DEMO_MODE` (`live|cached`), `VISION_ENABLED` (`0|1`).

## Provisioning (before Task 1 — partly sequential)

1. **Nicrron** — redeem `BETAWORKS250`, confirm email, create key. Credits expire 11:59 PM ET tonight.
2. **PRISM** — sign up → key → **land a first trace** → *then* redeem `DEALFLOW`. One workspace per team; owner invites the others.
3. **akta.pro** — slowest: Stripe checkout with `DEALFLOW50`.
4. **Solari** — redeem `VC-HACK1MO-DNNXSYYM`.
5. **Roundtable** — account + workspace.
6. **Ask the organizers** whether "use all five" inherits each sponsor's own qualification rules (spec §9.1).

## Backend File Structure

| File | Responsibility |
|---|---|
| `api/models.py` | Pydantic mirrors of `src/lib/types.ts`, camelCase. No logic. |
| `api/store.py` | Disk-backed JSON persistence. |
| `api/main.py` | FastAPI app, all 13 routes, CORS, error handler. |
| `api/tracing.py` | PRISM init + `span()`. |
| `api/nicrron.py` | Client, model constants, JSON helper, classification. |
| `api/debate.py` | 4-round debate → `ParsedDocument`. |
| `api/checks.py` | Deterministic Rule 501(a) checks. **TDD.** |
| `api/decide.py` | Escalation, conflict detection, issue guardrail. **TDD.** |
| `api/passport.py` | Passport issuance, lookup, funds, shares. |
| `api/venue.py` | `DebateVenue`: `LocalJsonVenue`, `RoundtableVenue`. |
| `api/adapters/solari.py` | BrokerCheck + cache. |
| `api/adapters/akta.py` | Company corroboration + cache. |
| `api/adapters/sandbox.py` | KYC + account-link stubs honoring `scenario`. |
| `fixtures/` | Demo documents, cached external responses. |
| `tests/` | `test_checks.py`, `test_decide.py`, `test_debate.py` |

---

## Task 1: SPIKE — document modality — ✅ COMPLETE (2026-10-24)

- [x] **Resolved: vision works on both models.** The catalog lists every model as modality `chat` and advertises no image input — that label is wrong. A base64 PNG in an `image_url` content block was described accurately by `openai/gpt-6-luna` *and* `anthropic/claude-sonnet-5`.
- [x] **Decision:** `VISION_ENABLED=1`. Extractor `openai/gpt-6-luna`, challenger `anthropic/claude-sonnet-5` — vendors stay distinct. `signs_of_alteration` **stays in** the failure modes.
- [x] Demo case 4 still uses the **arithmetic** forgery as its primary catch (spec §6) — two independently stateable defects beat one flashier visual one when a judge asks for a re-run. Visual alteration is now a bonus channel.

Probe script: `scratchpad/probe.py`. Re-run it rather than trusting catalog metadata.

---

## Task 2: FastAPI skeleton, contract-exact models, stub routes

**Time box: 50 min.** Point the real frontend at this before writing any logic — a contract mismatch found now costs minutes; found at hour five it costs the demo.

**Files:** Create `api/models.py`, `api/store.py`, `api/main.py`, `api/adapters/sandbox.py`, `requirements.txt`, `.env.example`

**Interfaces produced:** every model in `src/lib/types.ts`; `store.save/get/all` per collection; all 13 routes returning contract-shaped data.

- [ ] **Step 1: `requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
pydantic==2.9.2
openai==1.54.0
httpx==0.27.2
python-multipart==0.0.12
pytest==8.3.3
python-dotenv==1.0.1
```

- [ ] **Step 2: `api/models.py` — mirror `src/lib/types.ts` exactly**

Port every interface. Use a camelCase alias generator so the wire format matches:

```python
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
```

Then every model subclasses `Base`. Port, with these exact literal unions:

- `InvestorType = Literal["individual", "joint", "entity"]`
- `EntityKind = Literal["llc", "corporation", "partnership", "trust"]`
- `Pathway = Literal["income", "net_worth", "license", "min_investment", "entity_assets"]`
- `LicenseType = Literal["series7", "series65", "series82"]`
- `DocType = Literal["w2", "form_1040", "k1", "bank_statement", "brokerage_statement", "cpa_letter", "trust_agreement", "entity_formation", "other"]`
- `CheckResult = Literal["pass", "fail", "warn"]`
- `Decision = Literal["approved", "review", "needs_info", "denied"]`

And these models: `Profile`, `KycSession`, `LinkedAccount`, `AccountLink`, `ParsedDocument`, `IncomeEvidence`, `NetWorthEvidence`, `LicenseEvidence`, `MinInvestmentEvidence`, `EntityAssetsEvidence`, `Attestations`, `ApplicationInput`, `Check`, `Evaluation`, `Verification`, `Passport`, `Fund`, `Share`.

**Field names come from `types.ts`, not from this plan.** Read it.

- [ ] **Step 3: `api/store.py` — disk-backed, survives `--reload`**

Without this, every `uvicorn --reload` wipes the frontend dev's test data.

```python
import json, pathlib
from typing import TypeVar, Type
from pydantic import BaseModel

DIR = pathlib.Path("fixtures/live")
DIR.mkdir(parents=True, exist_ok=True)
T = TypeVar("T", bound=BaseModel)


def _file(collection: str) -> pathlib.Path:
    return DIR / f"{collection}.json"


def _read(collection: str) -> dict:
    p = _file(collection)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError:
        return {}


def put(collection: str, key: str, model: BaseModel) -> None:
    data = _read(collection)
    data[key] = model.model_dump(by_alias=True, mode="json")
    _file(collection).write_text(json.dumps(data, indent=2))


def get(collection: str, key: str, cls: Type[T]) -> T | None:
    raw = _read(collection).get(key)
    return cls.model_validate(raw) if raw else None


def all_of(collection: str, cls: Type[T]) -> list[T]:
    out = []
    for raw in _read(collection).values():
        try:
            out.append(cls.model_validate(raw))
        except Exception:
            continue
    return out
```

- [ ] **Step 4: `api/adapters/sandbox.py` — KYC and account links**

Deterministic stubs. Persona and Plaid are explicitly out of scope (spec §4.6); the `scenario` parameter is contract.

```python
import uuid, datetime
from api.models import KycSession, AccountLink, LinkedAccount


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:14]}"


def start_kyc(legal_name: str, scenario: str = "clean") -> KycSession:
    return KycSession(id=new_id("kyc"),
                      status="failed" if scenario == "fail" else "verified",
                      name_on_id=legal_name, ofac_hit=scenario == "ofac",
                      pep=False, created_at=_now())


def link_accounts(scenario: str = "high") -> AccountLink:
    k = 1.0 if scenario == "high" else 0.2
    return AccountLink(id=new_id("link"), created_at=_now(), accounts=[
        LinkedAccount(id="a1", institution="Chase", name="Total Checking •• 4417",
                      kind="checking", balance=round(84_250 * k)),
        LinkedAccount(id="a2", institution="Fidelity",
                      name="Individual Brokerage •• 2093", kind="brokerage",
                      balance=round(1_142_900 * k)),
        LinkedAccount(id="a3", institution="Vanguard", name="Rollover IRA •• 7781",
                      kind="retirement", balance=round(318_400 * k)),
    ])
```

- [ ] **Step 5: `api/main.py` — CORS, error shape, all 13 routes**

The two details that silently break the UI:

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import HTTPException, RequestValidationError

app = FastAPI(title="Savy")

# Wildcard origins are rejected by browsers when credentials are included,
# and the frontend sends credentials: 'include'.
app.add_middleware(CORSMiddleware,
                   allow_origins=["http://localhost:5173"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


# The UI reads {"error": "..."}; FastAPI's default is {"detail": ...}.
@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": str(exc.errors()[:2])})


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"error": str(exc)})
```

Implement all 13 routes. Wire `/kyc` and `/account-links` to `sandbox.py` for real. The rest return contract-shaped placeholder data for now — later tasks replace the bodies, never the signatures. Every response must be serialized `by_alias=True`.

- [ ] **Step 6: Verify against the actual UI**

```bash
uvicorn api.main:app --reload --port 8000
# in another shell:
echo 'VITE_API_BASE_URL=http://localhost:8000' > .env.local
npm run dev
```
Walk the onboarding flow in the browser. Check the browser console for CORS errors and the network tab for camelCase keys. **Do not proceed until a case submits end-to-end without a console error.** Then restart uvicorn and confirm the case still loads.

- [ ] **Step 7: Commit**

```bash
git add requirements.txt .env.example api/
git commit -m "feat(api): contract-exact models, CORS, error shape, sandbox stubs"
```

---

## Task 3: PRISM tracing

**Time box: 25 min.** Wire before there is anything to retrofit. Note the provisioning order — the `DEALFLOW` credit needs a trace to have already landed.

**Files:** Create `api/tracing.py`; modify `api/main.py`

**Interfaces produced:** `init_tracing()`, `span(name, **attrs)` yielding an object with `.set(**attrs)`, `current_trace_url()`

- [ ] **Step 1:** `pip install prismtrace-sdk`. If unresolved in 5 minutes, use `opentelemetry-sdk` + `opentelemetry-exporter-otlp` against PRISM's OTLP endpoint per `blockconvey.com/docs`.

- [ ] **Step 2: Write `api/tracing.py`** — tracing is passive and must never break a request. Wrap everything in try/except, and when PRISM is unavailable fall through to `logging` with the identical interface, so no call site changes. Provide a module-level `_ENABLED` flag set by `init_tracing()`.

- [ ] **Step 3: Land a first trace, then redeem `DEALFLOW`**

```python
from api.tracing import init_tracing, span
init_tracing()
with span("smoke.test", verification_id="ver_demo") as s:
    s.set(result="ok")
```
Confirm it appears in the PRISM dashboard, **then** redeem the code under Settings → Billing & usage. If no span appears inside the box, keep the logging path and move on.

- [ ] **Step 4: Commit** — `git commit -m "feat(api): PRISM tracing with logging fallback"`

---

## Task 4: SPIKE — can Solari reach BrokerCheck? (15 min, decision only)

- [ ] **Step 1:** Read the Solari docs (PDF linked in `resources.md`); redeem `VC-HACK1MO-DNNXSYYM`.
- [ ] **Step 2:** Drive one cloud browser to `https://brokercheck.finra.org/`, search the real CRD chosen for demo case 2, screenshot, return page text. **Time it.**
- [ ] **Step 3:** Decide: under ~30s → wire live with cache fallback. Slow/flaky → cache-first, live as background refresh. Unreachable → pre-record the session and serve cached results, and say so plainly on stage (the call is real, just made earlier).

---

## Task 5: Nicrron client and document classification

**Time box: 25 min.**

**Files:** Create `api/nicrron.py`, `tests/test_nicrron.py`

**Interfaces produced:** `EXTRACTOR_MODEL`, `CHALLENGER_MODEL`, `ADJUDICATOR_MODEL`, `VISION_ENABLED`, `complete_json(model, system, user, image_b64=None) -> dict`, `classify(text, filename, image_b64=None) -> str` returning a valid `DocType`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_nicrron.py
import pytest
from api.nicrron import _coerce_json, CHALLENGER_MODEL, EXTRACTOR_MODEL


def test_coerce_json_strips_markdown_fence():
    assert _coerce_json('```json\n{"docType": "w2"}\n```') == {"docType": "w2"}


def test_coerce_json_recovers_json_embedded_in_prose():
    assert _coerce_json('Sure! {"docType": "form_1040"} hope that helps')["docType"] == "form_1040"


def test_coerce_json_raises_on_garbage():
    with pytest.raises(ValueError):
        _coerce_json("I cannot help with that.")


def test_challenger_is_a_different_vendor_than_extractor():
    """Cross-vendor independence is the design's core claim. The same vendor twice
    shares blind spots and the review becomes a rubber stamp."""
    assert EXTRACTOR_MODEL.split("/")[0] != CHALLENGER_MODEL.split("/")[0]
```

- [ ] **Step 2:** Run `pytest tests/test_nicrron.py -v` → fails, module missing.

- [ ] **Step 3: Implement.** `complete_json` posts via the `openai` SDK with `base_url` set to Nicrron, `temperature=0`, records `model` and token usage on a PRISM span, and parses the reply with `_coerce_json` (strip fences, then fall back to the outermost `{...}`, then raise `ValueError`). Attach an `image_url` content block only when `image_b64` **and** `VISION_ENABLED`. `classify` returns one of the nine `DocType` values, defaulting to `"other"` when the model returns anything unrecognized — note the contract's value is `form_1040`, **not** `1040`.

- [ ] **Step 4:** `pytest tests/test_nicrron.py -v` → 4 passed.

- [ ] **Step 5: Smoke-check a live call.** `complete_json(EXTRACTOR_MODEL, "Reply JSON only.", 'Reply {"ok": true}')` → `{'ok': True}`. 401 = key unset; 402 = credits not redeemed.

- [ ] **Step 6: Commit** — `git commit -m "feat(api): Nicrron client and document classification"`

---

## Task 6: The adversarial debate → `ParsedDocument`

**Time box: 80 min.** The centerpiece. Plain function calls; Roundtable layers on in Task 11.

**Files:** Create `api/debate.py`, `tests/test_debate.py`

**Interfaces produced:** `failure_modes() -> list[str]`, `parse_document(text, filename, doc_type, holder_hint, image_b64=None) -> tuple[ParsedDocument, list[DebateTurn]]`

The debate's output **must populate `ParsedDocument` exactly**: `income`, `balance`, `holderName`, `taxYear`, `statementDate`, `confidence`, `flags`, `summary`. Unresolved challenges become `flags[]` — the contract already had a home for adversarial findings, which is why anything below 0.9 confidence or carrying a flag escalates the verification to `review`.

- [ ] **Step 1: Write the failing tests**

Stub the model calls; only the orchestration is deterministically testable.

```python
# tests/test_debate.py
from unittest.mock import patch
from api import debate

TEXT = "Form W-2  Tax year 2024  Employer: Acme Corp  Box 1 Wages: $185,000.00"

R1 = {"fields": {"income": {"value": 185000, "confidence": 0.95, "sourceQuote": "$185,000.00"},
                 "taxYear": {"value": 2024, "confidence": 0.98, "sourceQuote": "Tax year 2024"},
                 "holderName": {"value": "Jane Specimen", "confidence": 0.9, "sourceQuote": "Jane Specimen"}}}
R2 = {"challenges": [{"fieldName": "income", "failureMode": "wrong_field",
                      "reason": "Box 1 wages exclude deferred compensation"}]}
R3 = {"resolutions": [{"fieldName": "income", "action": "DEFEND",
                       "revisedValue": None, "justification": "Box 1 is the stated figure"}]}
R4 = {"fields": R1["fields"], "confidence": 0.93, "flags": [],
      "summary": "Form W-2 for tax year 2024, $185,000 reported.",
      "trustAssessment": "internally consistent"}


def test_parse_document_returns_contract_shaped_result():
    with patch.object(debate, "complete_json", side_effect=[R1, R2, R3, R4]):
        doc, turns = debate.parse_document(TEXT, "w2_2024.txt", "w2", "Jane Specimen")
    assert doc.income == 185000
    assert doc.tax_year == 2024
    assert doc.doc_type == "w2"
    assert doc.balance is None
    assert 0.0 <= doc.confidence <= 1.0
    assert isinstance(doc.flags, list)
    assert doc.summary


def test_four_rounds_are_recorded_in_order():
    with patch.object(debate, "complete_json", side_effect=[R1, R2, R3, R4]):
        _, turns = debate.parse_document(TEXT, "w2_2024.txt", "w2", "Jane Specimen")
    assert [t.round for t in turns] == [1, 2, 3, 4]
    assert [t.actor for t in turns] == ["extractor", "challenger", "extractor", "adjudicator"]


def test_unresolved_challenge_becomes_a_flag():
    r4 = {**R4, "flags": ["Income field may exclude deferred compensation"],
          "confidence": 0.72}
    with patch.object(debate, "complete_json", side_effect=[R1, R2, R3, r4]):
        doc, _ = debate.parse_document(TEXT, "w2_2024.txt", "w2", "Jane Specimen")
    assert doc.flags
    assert doc.confidence < 0.9        # escalates the verification to review


def test_conceded_value_replaces_the_original():
    r3 = {"resolutions": [{"fieldName": "income", "action": "CONCEDE",
                           "revisedValue": 198000, "justification": "Misread"}]}
    r4 = {**R4, "fields": {**R1["fields"],
                           "income": {"value": 198000, "confidence": 0.9,
                                      "sourceQuote": "$198,000.00"}}}
    with patch.object(debate, "complete_json", side_effect=[R1, R2, r3, r4]):
        doc, _ = debate.parse_document(TEXT, "w2_2024.txt", "w2", "Jane Specimen")
    assert doc.income == 198000


def test_round3_is_skipped_when_nothing_is_challenged():
    with patch.object(debate, "complete_json",
                      side_effect=[R1, {"challenges": []}, R4]) as m:
        doc, turns = debate.parse_document(TEXT, "w2_2024.txt", "w2", "Jane Specimen")
    assert m.call_count == 3
    assert len(turns) == 3


def test_alteration_mode_absent_without_vision():
    """Text-only: asking for font evidence invites the model to invent it."""
    with patch.object(debate, "VISION_ENABLED", False):
        assert "signs_of_alteration" not in debate.failure_modes()


def test_alteration_mode_present_with_vision():
    with patch.object(debate, "VISION_ENABLED", True):
        assert "signs_of_alteration" in debate.failure_modes()


def test_arithmetic_forgery_prompt_includes_reconciliation_mode():
    assert "face_arithmetic_error" in debate.failure_modes()
    assert "impossible_dates" in debate.failure_modes()
```

- [ ] **Step 2:** Run `pytest tests/test_debate.py -v` → fails, no `parse_document`.

- [ ] **Step 3: Implement `api/debate.py`.**

`TEXT_FAILURE_MODES = ["misread_or_transposed_digits", "wrong_field", "stale_or_wrong_tax_year", "cross_document_inconsistency", "face_arithmetic_error", "impossible_dates", "unsupported_inference"]`, and `failure_modes()` appends `"signs_of_alteration"` only when `VISION_ENABLED`.

Four rounds, each wrapped in its own PRISM span:

1. **Extract** (`EXTRACTOR_MODEL`) — asks for `income`, `balance`, `holderName`, `taxYear`, `statementDate`, each as `{value, confidence, sourceQuote}`. Instruct it to omit any field the document does not state rather than guessing. For tax documents, `income` is AGI, or W-2 wages when no AGI is present (per the `ParsedDocument.income` doc comment).
2. **Challenge** (`CHALLENGER_MODEL`) — receives the document and the extraction, is prompted with the named failure modes, and must tie every challenge to specific document text. Explicitly tell it that returning an empty list is correct when the extraction is sound, and that vague doubt is not a challenge.
3. **Respond** (`EXTRACTOR_MODEL`, skipped when there are no challenges) — `CONCEDE` with a `revisedValue`, or `DEFEND` with a quote. Apply concessions to the field set.
4. **Adjudicate** (`ADJUDICATOR_MODEL`) — final field values, overall `confidence`, `flags[]` for anything unresolved or suspicious, and a one-line `summary` in the style of the mock's (`"Form W-2 for tax year 2024, $185,000 reported."`). Tell it explicitly: **it does not apply dollar thresholds** — a deterministic engine does that.

Then assemble a `ParsedDocument` with a fresh `doc_{id}`, `created_at` as UTC ISO, and `holder_name` falling back to `holder_hint`. Clamp `confidence` into `[0, 1]`. Coerce currency strings (`"$185,000.00"`) to numbers.

- [ ] **Step 4:** `pytest tests/test_debate.py -v` → 8 passed.

- [ ] **Step 5: Run one real debate and TIME it.** Use the case 5 2024 W-2 fixture. **If it exceeds ~25s, plan on pre-seeding the demo cases** and doing one live run as the honesty beat — decide now, not at hour five.

- [ ] **Step 6: Wire `POST /documents`** to `parse_document`, persist the result, return it `by_alias=True`. Upload a file through the real UI and confirm the evidence step renders it.

- [ ] **Step 7: Commit** — `git commit -m "feat(api): cross-vendor adversarial document debate"`

---

## Task 7: Deterministic Rule 501(a) checks (TDD, strict)

**Time box: 45 min.** Pure functions. Port `estimateNetWorth` from `src/lib/rules.ts` **verbatim** — its treatment of the primary residence is more correct than a naive subtraction, and the frontend shows hints from the same formula, so any divergence is visible to the user.

**Files:** Create `api/checks.py`, `tests/test_checks.py`

**Interfaces produced:** `THRESHOLDS`, `estimate_net_worth(**kwargs) -> dict`, `income_threshold(investor_type)`, `min_investment_threshold(investor_type)`, `run_checks(input, docs, kyc, link, evidence) -> list[Check]`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_checks.py
from api.checks import estimate_net_worth, run_checks, THRESHOLDS
from api.models import (ApplicationInput, Profile, Attestations, IncomeEvidence,
                        NetWorthEvidence, ParsedDocument, KycSession)


def _kyc(status="verified", ofac=False):
    return KycSession(id="kyc_1", status=status, name_on_id="Jane Specimen",
                      ofac_hit=ofac, pep=False, created_at="2026-10-24T12:00:00Z")


def _doc(doc_id="doc_1", income=None, balance=None, tax_year=None,
         confidence=0.95, flags=None, doc_type="w2"):
    return ParsedDocument(id=doc_id, file_name=f"{doc_id}.pdf", doc_type=doc_type,
                          holder_name="Jane Specimen", tax_year=tax_year,
                          statement_date=None, income=income, balance=balance,
                          confidence=confidence, flags=flags or [],
                          summary="s", created_at="2026-10-24T12:00:00Z")


def _input(pathway="income", investor_type="individual", **kw):
    return ApplicationInput(
        investor_type=investor_type,
        profile=Profile(legal_name="Jane Specimen", email="j@example.com", country="US"),
        kyc_session_id="kyc_1", pathway=pathway, account_link_id=None,
        document_ids=kw.pop("document_ids", []),
        attestations=Attestations(accurate=True, not_third_party_financed=True,
                                  consent_to_verify=True),
        **kw)


def _by_id(checks, cid):
    return next(c for c in checks if c.id == cid)


# --- net worth: the formula must match src/lib/rules.ts exactly ---

def test_primary_residence_is_excluded_entirely():
    r = estimate_net_worth(verified_assets=1_200_000, other_assets=0, liabilities=0,
                           primary_residence_value=800_000,
                           primary_residence_mortgage=500_000,
                           mortgage_increase_last_60_days=0)
    assert r["net_worth"] == 1_200_000   # home and its mortgage both ignored


def test_underwater_mortgage_counts_as_a_liability():
    r = estimate_net_worth(verified_assets=1_500_000, other_assets=0, liabilities=0,
                           primary_residence_value=400_000,
                           primary_residence_mortgage=600_000,
                           mortgage_increase_last_60_days=0)
    assert r["net_worth"] == 1_300_000   # 200k underwater


def test_recent_mortgage_increase_counts_as_a_liability():
    r = estimate_net_worth(verified_assets=1_500_000, other_assets=0, liabilities=0,
                           primary_residence_value=900_000,
                           primary_residence_mortgage=500_000,
                           mortgage_increase_last_60_days=150_000)
    assert r["net_worth"] == 1_350_000


def test_underwater_and_recent_increase_do_not_double_count():
    """rules.ts uses max(underwater, recent), not a sum."""
    r = estimate_net_worth(verified_assets=1_500_000, other_assets=0, liabilities=0,
                           primary_residence_value=400_000,
                           primary_residence_mortgage=600_000,
                           mortgage_increase_last_60_days=150_000)
    assert r["net_worth"] == 1_300_000


# --- income: each of two years, never an average ---

def test_income_passes_when_both_years_clear_the_threshold():
    c = _by_id(run_checks(_input(income=IncomeEvidence(
        prior_year2=240_000, prior_year1=250_000, expected_current=250_000)),
        [], _kyc(), None, {}), "pathway")
    assert c.result == "pass"


def test_income_fails_when_one_year_is_short():
    c = _by_id(run_checks(_input(income=IncomeEvidence(
        prior_year2=185_000, prior_year1=250_000, expected_current=250_000)),
        [], _kyc(), None, {}), "pathway")
    assert c.result == "fail"


def test_income_rejects_a_qualifying_two_year_average():
    c = _by_id(run_checks(_input(income=IncomeEvidence(
        prior_year2=150_000, prior_year1=300_000, expected_current=300_000)),
        [], _kyc(), None, {}), "pathway")
    assert c.result == "fail"


def test_joint_income_uses_the_300k_threshold():
    c = _by_id(run_checks(_input(investor_type="joint", income=IncomeEvidence(
        prior_year2=250_000, prior_year1=260_000, expected_current=250_000)),
        [], _kyc(), None, {}), "pathway")
    assert c.result == "fail"


def test_income_check_cites_the_statute():
    c = _by_id(run_checks(_input(income=IncomeEvidence(
        prior_year2=240_000, prior_year1=250_000, expected_current=250_000)),
        [], _kyc(), None, {}), "pathway")
    assert "501(a)(6)" in c.detail


# --- the cross-check: self-reported vs what the documents actually say ---

def test_self_reported_income_contradicting_a_document_warns():
    """Demo case 5. LP claims 240k for 2024; the W-2 reads 185k."""
    docs = [_doc(income=185_000, tax_year=2024)]
    checks = run_checks(_input(income=IncomeEvidence(
        prior_year2=240_000, prior_year1=250_000, expected_current=250_000),
        document_ids=["doc_1"]), docs, _kyc(), None, {})
    c = _by_id(checks, "income_cross_check")
    assert c.result == "warn"
    assert "185" in c.detail and "240" in c.detail


def test_matching_self_report_and_document_passes_the_cross_check():
    docs = [_doc(income=240_000, tax_year=2024)]
    checks = run_checks(_input(income=IncomeEvidence(
        prior_year2=240_000, prior_year1=250_000, expected_current=250_000),
        document_ids=["doc_1"]), docs, _kyc(), None, {})
    assert _by_id(checks, "income_cross_check").result == "pass"


# --- document confidence and flags ---

def test_low_confidence_document_warns():
    docs = [_doc(confidence=0.72)]
    checks = run_checks(_input(document_ids=["doc_1"], income=IncomeEvidence(
        prior_year2=240_000, prior_year1=250_000, expected_current=250_000)),
        docs, _kyc(), None, {})
    assert _by_id(checks, "doc_doc_1").result == "warn"


def test_flagged_document_warns_even_at_high_confidence():
    docs = [_doc(confidence=0.97, flags=["Closing balance does not reconcile"])]
    checks = run_checks(_input(document_ids=["doc_1"], income=IncomeEvidence(
        prior_year2=240_000, prior_year1=250_000, expected_current=250_000)),
        docs, _kyc(), None, {})
    c = _by_id(checks, "doc_doc_1")
    assert c.result == "warn"
    assert "reconcile" in c.detail


# --- identity and sanctions ---

def test_failed_kyc_fails_the_identity_check():
    checks = run_checks(_input(), [], _kyc(status="failed"), None, {})
    assert _by_id(checks, "identity").result == "fail"


def test_ofac_hit_warns_on_sanctions():
    checks = run_checks(_input(), [], _kyc(ofac=True), None, {})
    assert _by_id(checks, "sanctions").result == "warn"


# --- license, min investment, entity ---

def test_license_check_reads_solari_evidence():
    checks = run_checks(_input(pathway="license"), [], _kyc(), None,
                        {"license": {"found": True, "type": "series65"}})
    assert _by_id(checks, "pathway").result == "pass"


def test_license_not_found_fails():
    checks = run_checks(_input(pathway="license"), [], _kyc(), None,
                        {"license": {"found": False, "type": "series65"}})
    assert _by_id(checks, "pathway").result == "fail"


def test_entity_formed_for_purpose_warns():
    from api.models import EntityAssetsEvidence
    checks = run_checks(_input(pathway="entity_assets", investor_type="entity",
                               entity_assets=EntityAssetsEvidence(
                                   total_assets=9_000_000, formed_for_purpose=True)),
                        [], _kyc(), None, {})
    assert _by_id(checks, "pathway").result == "warn"


def test_entity_corroboration_warns_on_an_unresolvable_entity():
    from api.models import EntityAssetsEvidence
    checks = run_checks(_input(pathway="entity_assets", investor_type="entity",
                               entity_assets=EntityAssetsEvidence(
                                   total_assets=9_000_000, formed_for_purpose=False)),
                        [], _kyc(), None,
                        {"entity": {"resolved": False, "adverse_news": []}})
    c = _by_id(checks, "entity_corroboration")
    assert c.result == "warn"
    assert "corroborat" in c.detail.lower()   # never claims to verify accreditation
```

- [ ] **Step 2:** Run `pytest tests/test_checks.py -v` → fails, module missing.

- [ ] **Step 3: Implement `api/checks.py`.** Mirror `fakeEvaluate()`'s check ids and labels exactly (`identity`, `sanctions`, `doc_{id}`, `pathway`, `income_{year}`, `assets_verified`, `liabilities`, `trust`, `attest`), and add `income_cross_check` and `entity_corroboration`. Put the statutory citation in `detail` for every pathway check. `estimate_net_worth` is a direct port of `src/lib/rules.ts`:

```python
def estimate_net_worth(*, verified_assets, other_assets, liabilities,
                       primary_residence_value, primary_residence_mortgage,
                       mortgage_increase_last_60_days):
    underwater = max(0, primary_residence_mortgage - primary_residence_value)
    recent = min(mortgage_increase_last_60_days, primary_residence_mortgage)
    assets = verified_assets + other_assets
    total_liabilities = liabilities + max(underwater, recent)
    return {"assets": assets, "liabilities": total_liabilities,
            "net_worth": assets - total_liabilities}
```

- [ ] **Step 4:** `pytest tests/test_checks.py -v` → 18 passed.

- [ ] **Step 5: Commit** — `git commit -m "feat(api): deterministic Rule 501(a) checks with document cross-check"`

---

## Task 8: Decision, conflict detection, and the issue guardrail (TDD, strict)

**Time box: 30 min.** The PRISM guardrail lives here — it is the same logic the decision engine already needs, so deferring it would forfeit the PRISM track for no saving.

**Files:** Create `api/decide.py`, `tests/test_decide.py`

**Interfaces produced:** `RANK`, `decide(checks) -> Evaluation`, `detect_conflict(recommendation, checks) -> bool`, `assert_issue_guardrail(verification) -> None`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_decide.py
import pytest
from api.decide import decide, detect_conflict, assert_issue_guardrail
from api.models import Check, Verification, Evaluation


def _c(cid, result, detail="d"):
    return Check(id=cid, label=cid, result=result, detail=detail)


def test_all_pass_is_approved():
    assert decide([_c("identity", "pass"), _c("pathway", "pass")]).decision == "approved"


def test_a_warn_escalates_to_review():
    assert decide([_c("identity", "pass"), _c("doc_1", "warn")]).decision == "review"


def test_a_failed_pathway_denies():
    assert decide([_c("identity", "pass"), _c("pathway", "fail")]).decision == "denied"


def test_a_failed_identity_needs_info():
    """Identity and document-coverage gaps are fixable by the LP, so they ask for
    more information rather than denying."""
    assert decide([_c("identity", "fail")]).decision == "needs_info"


def test_the_worst_check_wins():
    ev = decide([_c("identity", "pass"), _c("doc_1", "warn"), _c("pathway", "fail")])
    assert ev.decision == "denied"


def test_reasons_are_deduplicated_and_only_present_when_not_approved():
    ev = decide([_c("identity", "pass"), _c("pathway", "pass")])
    assert ev.reasons == []


def test_conflict_when_agents_approve_but_a_check_fails():
    """Demo case 5."""
    assert detect_conflict("APPROVE", [_c("pathway", "fail")]) is True


def test_no_conflict_when_both_agree():
    assert detect_conflict("APPROVE", [_c("pathway", "pass")]) is False


def test_conflict_when_agents_deny_but_everything_passes():
    assert detect_conflict("DENY", [_c("pathway", "pass")]) is True


def test_guardrail_blocks_issuing_a_passport_on_a_failed_check():
    v = Verification(id="ver_1", input=None, evaluation=Evaluation(
        decision="approved", checks=[_c("pathway", "fail")], reasons=[]),
        passport_id=None, created_at="2026-10-24T12:00:00Z", reviewed_at=None)
    with pytest.raises(AssertionError):
        assert_issue_guardrail(v)


def test_guardrail_allows_a_clean_approval():
    v = Verification(id="ver_1", input=None, evaluation=Evaluation(
        decision="approved", checks=[_c("pathway", "pass")], reasons=[]),
        passport_id=None, created_at="2026-10-24T12:00:00Z", reviewed_at=None)
    assert assert_issue_guardrail(v) is None
```

If `Verification.input` cannot be `None`, build a minimal valid `ApplicationInput` in the test helper instead — do not relax the model to satisfy a test.

- [ ] **Step 2:** Run `pytest tests/test_decide.py -v` → fails.

- [ ] **Step 3: Implement `api/decide.py`.** `RANK = {"approved": 0, "review": 1, "needs_info": 2, "denied": 3}` and the worst check wins, exactly as `fakeEvaluate` does. Map each check to its escalation: `warn` → `review`; `fail` on `identity`/`sanctions`/`income_{year}`/`min_investment` coverage → `needs_info`; `fail` on a pathway test → `denied`. Collect plain-language `reasons` (deduplicated, order preserved) only for non-passing checks. `assert_issue_guardrail` refuses to issue a passport when any check is `fail` or a conflict is unresolved — enforced in code, and mirrored as a PRISM rule.

- [ ] **Step 4:** `pytest tests/test_decide.py -v` → 11 passed.

- [ ] **Step 5: Mirror the guardrail into PRISM via MCP.** Connect your editor to PRISM's MCP (Brief 2 of 2 → Generate management prompt) and add the rule: *no trace may contain an `issue` span when a `check:*` span has `result="fail"`.* Then demonstrate v1 violating it (temporarily bypass the assert) and v2 not, on identical inputs. That is the PRISM challenge's exact ask.

- [ ] **Step 6: Commit** — `git commit -m "feat(api): decision escalation, conflict detection, issue guardrail"`

---

## Task 9: Solari BrokerCheck adapter and `/licenses/check`

**Time box: 30 min.** Shape depends on Task 4.

**Files:** Create `api/adapters/solari.py`, `fixtures/cache/licenses.json`; wire `POST /licenses/check`

**Interfaces produced:** `check_license(license_type, crd) -> dict` with `found`, `name`, `source_url`, `screenshot_url`, `checked_at`, `cache_hit`

- [ ] **Step 1: Write the cache fixture first** — keyed by CRD, with a `default` entry. This is the demo's safety net, so it comes before the live path.
- [ ] **Step 2: Implement.** Honor `DEMO_MODE=cached` by returning cache immediately. On `live`, attempt the Solari browser with a hard timeout and fall back to cache on **any** exception. **Preserve the contract:** a CRD starting with `9` returns `found: False` regardless of mode — the UI documents that as its failure demo. Record `source_url`, `screenshot_url`, and `checked_at` on a PRISM span.
- [ ] **Step 3: Verify the fallback, not just the happy path.** Run with a deliberately bogus `SOLARI_API_KEY` and confirm it returns cached data rather than raising. Then check the real UI's license step with a `9`-prefixed CRD and a normal one.
- [ ] **Step 4: Commit** — `git commit -m "feat(api): Solari BrokerCheck adapter with verified cache fallback"`

---

## Task 10: akta.pro entity corroboration

**Time box: 25 min.** Entity verifications only.

**Files:** Create `api/adapters/akta.py`, `fixtures/cache/entities.json`

**Interfaces produced:** `corroborate_entity(name, domain=None) -> dict` with `resolved`, `headcount`, `funding_total`, `operating_business_signal`, `adverse_news`, `cache_hit`

- [ ] **Step 1: Cache fixture** — two entries: a healthy operating company, and an unresolvable shell keyed to demo case 3.
- [ ] **Step 2: Implement.** Company Search → Company Data → News Signals (names confirmed at `docs.akta.pro`; verify exact URL shapes there). `operating_business_signal` is true when the entity resolves and has nonzero headcount. Keep only negative-sentiment news. Fall back to cache on any failure. **This can never produce an accreditation `pass`** — akta.pro has no individual-level or AUM data. The resulting `Check` is `pass` or `warn` on *corroboration quality*, and `detail` must say so.
- [ ] **Step 3: Verify both modes.** If the endpoint paths are wrong, correct them from the docs — **do not exceed the box**; the cache carries the demo.
- [ ] **Step 4: Commit** — `git commit -m "feat(api): akta.pro entity corroboration with cache fallback"`

---

## Task 11: Verification pipeline, passport, funds, shares

**Time box: 50 min.** Ties everything together and completes the contract.

**Files:** Create `api/passport.py`; fill in `POST /verifications`, `GET /verifications/:id`, `POST /verifications/:id/sign-off`, `GET /passports/:id`, `POST /passports/lookup`, `GET /funds`, and the three share routes.

- [ ] **Step 1: `POST /verifications`.** Load the referenced KYC session, account link, and parsed documents from the store — **never trust figures from the client**. Call Solari for the `license` pathway and akta.pro for entities. Run `run_checks`, then `decide`. Set `conflict` from `detect_conflict` using the adjudicator's recommendation stored with the documents. On `approved`, call `assert_issue_guardrail` and issue a passport. Persist and return the `Verification`.

- [ ] **Step 2: `api/passport.py`.** Port `issue()` from the mock: `letterRef` as `AIV-{year}-{last 6 of verification id, uppercased}`, `expiresAt` 90 days out, `holderName` taking `entityName` for entities, and `checks` copied from the evaluation. `GET /passports/:id` returns `{passport, active}` where `active` is `expiresAt > now`. `POST /passports/lookup` matches on `letterRef` (trimmed, uppercased) **and** the verification's `profile.email` (trimmed, lowercased), returning `null` when nothing matches — not a 404.

- [ ] **Step 3: `POST /verifications/:id/sign-off`.** Only a verification in `review` may be signed off; anything else is a **409**. Set `decision` to `approved`, clear `reasons`, set `reviewedAt`, and issue the passport.

- [ ] **Step 4: Funds and shares.** Copy the five `FUNDS` from `src/lib/api/mock.ts` verbatim — the UI's copy references them. Sharing is idempotent: re-sharing to the same fund returns the existing `Share`. A new share gets one seeded view attributed to `"{fund.manager} compliance"`. `DELETE` on a share belonging to a different passport is a **404**.

- [ ] **Step 5: Walk the entire flow in the real UI** — onboard, submit, see the decision, view the passport, share it with a fund, revoke it. Fix every console error.

- [ ] **Step 6: Commit** — `git commit -m "feat(api): verification pipeline, passport issuance, sharing"`

---

## Task 12: Roundtable venue

**Time box: 30 min.** First candidate on the cut ladder.

**Files:** Create `api/venue.py`; call it from the debate and the verification pipeline.

- [ ] **Step 1: `LocalJsonVenue` first** — `open_thread`, `post_turn`, `save_version`, writing JSONL and versioned JSON under `fixtures/versions/`. This always works and ships regardless.
- [ ] **Step 2: `RoundtableVenue`** — create a thread per document debate, post one message per round authored as `"{actor} ({model})"`, and upsert the `Verification` as a versioned file, one version per stage. **Every method writes locally first and swallows Roundtable exceptions** — the pipeline must never break because a workspace call failed.
- [ ] **Step 3: `get_venue()`** returns `RoundtableVenue` when `ROUNDTABLE_API_KEY` is set and constructible, else `LocalJsonVenue`. Verify both paths; both are acceptable outcomes.
- [ ] **Step 4: Commit** — `git commit -m "feat(api): Roundtable debate venue with local fallback"`

---

## Task 13: Fixtures, seeding, rehearsal

**Time box: 40 min.** Do not skip. An unrehearsed demo is a failed demo.

**Files:** Create `fixtures/docs/*`, `scripts/seed_demo.py`

- [ ] **Step 1: Document fixtures.** Every file opens with `SYNTHETIC SPECIMEN — NOT A REAL DOCUMENT`.
  - **Case 1:** 2× W-2 + 1040, consistent employer, all comfortably above $200K.
  - **Case 4, arithmetic forgery** (must be catchable without vision): a closing balance that does not follow from opening + deposits − withdrawals, **and** a generation date preceding the statement period. Two independent, stateable inconsistencies.
  - **Case 5, the showpiece:** 2025 W-2 at $240,000; **2024 W-2 at $185,000**; a 1040 showing total income $212,000 against AGI $185,000. The application self-reports $240,000 for both prior years.
- [ ] **Step 2: `scripts/seed_demo.py`** — for each case: POST `/kyc`, upload documents, POST `/verifications`, print a table of `id | pathway | decision | conflict | flags`.
- [ ] **Step 3: Verify every decision against this table**

| Case | Expected decision | Notes |
|---|---|---|
| 1 clean income | `approved` | passport issued, `letterRef` present |
| 2 license (real CRD) | `approved` | Solari screenshot recorded |
| 3 entity shell | `review` | `entity_corroboration` warns |
| 4 arithmetic forgery | `review` | `flags[]` non-empty from round 2 |
| 5 self-report vs document | `review` | `income_cross_check` warns; conflict true |

**Case 5 must show the contradiction.** If the agents catch the 2024 shortfall themselves, the conflict still surfaces via `income_cross_check` — but verify the `detail` string names both figures, since that sentence is what you read aloud on stage.

- [ ] **Step 4: The WiFi-down drill.** Disconnect, set `DEMO_MODE=cached`, re-run the seed. Every case must complete. **Any crash is a P0** — fix before anything else.
- [ ] **Step 5: Commit** — `git commit -m "feat: demo fixtures, seeding, offline drill"`

---

## Task 14 (DEFERRED — only once the demo is safe): deterministic parser cross-check

The second backend engineer's parser, slotted in as an independent second extraction. Never on the critical path.

- [ ] **Step 1: Failing test** — two extractions agreeing raises confidence; disagreeing sets a flag and forces `review`.
- [ ] **Step 2: Implement** `cross_check_extraction(agent_doc, deterministic_fields) -> tuple[bool, list[str]]`. On agreement, `confidence = min(1.0, confidence + 0.10)`. On disagreement, append a flag naming both readings.
- [ ] **Step 3:** Run tests and commit.

---

## Cut Ladder

Task boxes sum to ~7.5h against a shorter clock, so cuts are pre-decided. Cut from the top; every line keeps all five sponsors integrated.

| Cut | Saves | Lost |
|---|---|---|
| 1. Roundtable → `LocalJsonVenue` only | 25 min | The workspace view. Debate still runs and is logged; one real `open_thread` call keeps the integration honest. |
| 2. akta.pro → cached only | 15 min | Nothing visible. Call shape real, response pre-fetched. |
| 3. Shares/revoke → read-only funds list | 20 min | The passport-reuse beat. Confirm with the frontend dev first. |
| 4. Debate → 2 rounds (extract + challenge, no respond/adjudicate) | 25 min | Concession handling. Keep **both vendors** — the cross-vendor claim is the architecture. |
| 5. Drop demo case 4 | 15 min | A memorable beat. Cut case 4 before case 5; case 5 proves the architecture. |

**Never cut:** Task 1 (modality), Task 2 step 6 (UI contract verification), Tasks 7–8 (checks and decisions), Task 13 step 4 (the WiFi drill).

---

## Self-Review Notes

**Spec coverage:** §2 contract → Task 2. §3 architecture → Tasks 6, 11. §4.1 Nicrron → Tasks 5, 6. §4.2 PRISM → Task 3, guardrail in Task 8. §4.3 Roundtable → Task 12. §4.4 akta.pro → Task 10. §4.5 Solari → Tasks 4, 9. §4.6 mocked Persona/Plaid → Task 2 step 4. §5 evaluation → Tasks 7, 8. §6 vision → Task 1. §7 demo → Task 13. §8 risks → fallbacks in every adapter plus the Cut Ladder.

**Deliberate gaps:** no auth (single-session demo). No PDF letter rendering. `fixtures/live/` is flat-file, correct for tonight and wrong for anything else. Persona and Plaid stay stubbed by design, not by omission.
