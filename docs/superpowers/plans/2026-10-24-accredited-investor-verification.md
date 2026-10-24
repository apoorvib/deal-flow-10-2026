# Accredited Investor Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a demoable verification service where two AI agents from different vendors adversarially review an investor's documents, a deterministic validator confirms the Rule 501(a) arithmetic, and every step is traced into an audit trail.

**Architecture:** A linear pipeline of stage functions over one `Case` object. Document understanding is a single 4-round LLM debate (extract → challenge → respond → adjudicate) over the investor's **entire document set at once**, run across two vendors via the Nicrron gateway and hosted in a Roundtable thread. A deterministic validator independently checks the statutory thresholds; disagreement between the agents' recommendation and the validator forces human review. PRISM traces the whole tree.

**Customer, stated precisely:** 506(c) issuers — syndicates, SPVs, and real-estate sponsors (`plan.md` §10 pain 4–5). **Not** "small VC funds": most VC funds raise under 506(b), which requires no verification at all, and 506(c) is only ~7% of Reg D (`plan.md` §8). Claiming VC funds invites a correct and deflating objection from any judge who knows private markets.

**Liability claim, stated precisely:** a documented, proper process **generally** preserves the issuer's Reg D exemption even if the investor lied (`plan.md` §11). Do not harden "generally" into "always."

**Tech Stack:** Python 3.11, FastAPI + uvicorn, pydantic v2, `openai` SDK pointed at Nicrron, `prismtrace-sdk` (or OTel exporter), `httpx`, pytest.

**Spec:** [`docs/superpowers/specs/2026-10-24-accredited-investor-verification-design.md`](../specs/2026-10-24-accredited-investor-verification-design.md)

## Global Constraints

- **Judging is tonight.** Every task has a time box; when it expires, take the fallback and move on. See **Cut Ladder** at the bottom — the honest task sum exceeds the clock, so cuts are planned, not improvised.
- **All five sponsor tools must be integrated** (organizer rule): Nicrron, Roundtable, PRISM deep; akta.pro, Solari thin.
- **Cost is a non-constraint.** `openai/gpt-6-luna` = $0.10/1M prompt tokens.
- **Model IDs, exact:** extractor `openai/gpt-6-luna`, challenger `anthropic/claude-sonnet-5`, adjudicator `openai/gpt-6-astra`, classifier `openai/gpt-6-luna`. The challenger MUST NOT be an OpenAI model — cross-vendor independence is the entire point of the design.
- **Nicrron base URL, exact:** `https://api.nicrron.ai/v1`
- **Assume text-only documents until Task 1 proves otherwise.** No model in the Nicrron catalog advertises image input. Everything downstream is written for pasted/extracted text and upgrades cleanly if Task 1 finds vision.
- **The model never decides alone.** `decision == "auto_approved"` requires the adjudicator's recommendation AND the validator to agree.
- **Confidence threshold:** `0.85`. **Near-threshold band:** `0.05` (5%).
- **One debate per case, not per document.** A per-document challenger structurally cannot see "W-2 employer ≠ 1040," which is one of its own named failure modes.
- **Test strategy, deliberate:** full TDD on `validator.py` and `triage.py` — pure functions whose exact behavior the demo depends on. Integration tasks get smoke checks; an SDK you have never run cannot be meaningfully unit-tested.
- **Every external call is cached.** The full demo must run with WiFi unplugged.
- **Never use real investor data, and never bind a real person's real records to synthetic financials.** See Task 2 step 4.
- **Env vars:** `NICRRON_API_KEY`, `PRISMTRACE_API_KEY`, `ROUNDTABLE_API_KEY`, `AKTA_API_KEY`, `SOLARI_API_KEY`, `DEMO_MODE` (`live` | `cached`), `VISION_ENABLED` (`0` | `1`).

## Provisioning Order (do this before Task 1, it is not all parallel)

1. **Nicrron** — redeem `BETAWORKS250` at `nicrron.ai/redeem?code=BETAWORKS250`, confirm email, create key. Credits die 11:59 PM ET tonight.
2. **PRISM** — signup → copy key → **land a first trace** → *then* Settings → Billing & usage → `DEALFLOW`. The credit redemption is gated on a trace already arriving, so PRISM cannot be fully provisioned up front. **One workspace per team:** Apoorv signs up as owner and invites the others. The frontend dev must NOT sign up independently or you split the team across two workspaces.
3. **akta.pro** — slowest. Stripe checkout with promo code `DEALFLOW50`.
4. **Solari** — redeem `VC-HACK1MO-DNNXSYYM`.
5. **Roundtable** — account + workspace.
6. **Ask the organizers, in the first ten minutes:** does "use all five sponsors" require meeting each sponsor's *own* qualification rules? `ninoo.md` says "Three rules. Miss any one of them and your entry is disqualified," one of which is building in Ninoo Builder. If their answer is yes, this plan needs rethinking while there is still time to rethink it.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/models.py` | All pydantic models. No logic. |
| `app/store.py` | Disk-backed case persistence (survives `--reload`). |
| `app/main.py` | FastAPI routes + SSE streaming. |
| `app/pipeline.py` | Stage orchestration; yields stage events. |
| `app/nicrron.py` | Nicrron client, model constants, JSON helper, doc classification. |
| `app/debate.py` | The 4-round adversarial debate over the document set. |
| `app/validator.py` | Deterministic Rule 501(a) checks. **TDD.** |
| `app/triage.py` | Decision routing + conflict detection + PRISM guardrail. **TDD.** |
| `app/venue.py` | `DebateVenue` protocol, `LocalJsonVenue`, `RoundtableVenue`. |
| `app/tracing.py` | PRISM init + span helper. |
| `app/letter.py` | Accreditation letter generation. |
| `app/adapters/solari.py` | BrokerCheck lookup + cache. |
| `app/adapters/akta.py` | Company enrichment + cache. |
| `fixtures/cases/` | The 5 demo cases. |
| `fixtures/docs/` | Synthetic document text. |
| `fixtures/cache/` | Cached external responses. |
| `tests/` | `test_validator.py`, `test_triage.py`, `test_debate.py`, `test_nicrron.py` |

---

## Task 1: SPIKE — document modality (10 min, FIRST API call of the night)

Not a feature task. Output is a **decision** that every later task depends on. The adversarial review found that no model in the live catalog advertises image input, so this is now a load-bearing unknown rather than a formality.

- [ ] **Step 1: Confirm what the catalog actually says**

Run: `curl -s https://api.nicrron.ai/v1/models | python -m json.tool | grep -i -E 'modal|vision|image' | head -40`

- [ ] **Step 2: Try one image anyway — the catalog may understate**

```python
# scratch_vision.py  (throwaway)
import base64, os
from openai import OpenAI
c = OpenAI(base_url="https://api.nicrron.ai/v1", api_key=os.environ["NICRRON_API_KEY"])
b64 = base64.b64encode(open("fixtures/docs/sample_w2.png", "rb").read()).decode()
try:
    r = c.chat.completions.create(
        model="openai/gpt-6-luna",
        messages=[{"role": "user", "content": [
            {"type": "text", "text": "What dollar amount appears in box 1?"},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
        ]}])
    print("VISION OK:", r.choices[0].message.content)
except Exception as e:
    print("VISION FAILED:", e)
```

- [ ] **Step 3: Set `VISION_ENABLED` and record the consequences**

| Outcome | Action |
|---|---|
| An image is read correctly | `VISION_ENABLED=1`. Fixtures may be images. `signs_of_alteration` stays in the challenger's failure modes. |
| Images rejected by luna but accepted by `anthropic/claude-sonnet-5` | `VISION_ENABLED=1`, extractor becomes Sonnet 5, and the **challenger moves to a third vendor** (`deepseek/deepseek-v4-flash`) to preserve cross-vendor independence. |
| No model reads images | `VISION_ENABLED=0`. **Documents are text only.** Fixtures are text. `signs_of_alteration` is **removed** from the challenger prompt — left in, it invites the model to invent visual evidence it cannot have. Demo case 4's forgery must be arithmetic (Task 2). |

- [ ] **Step 4: Tell the team the outcome in one line before anyone writes a fixture**

---

## Task 2: Demo fixtures (30 min, starts immediately, hand to the second backend engineer)

**Moved to the front.** The debate loop, validator, triage, letter, and caching are all untestable without documents — scheduling fixtures last made every downstream task unverifiable. This is also the right task to delegate: it is self-contained, needs no integration keys, and if it slips, nothing architectural breaks.

**Files:**
- Create: `fixtures/docs/*.txt` (or `.png` if `VISION_ENABLED=1`)
- Create: `fixtures/cases/case1_clean_income.json` … `case5_temporal_conflict.json`

- [ ] **Step 1: Write the four document bodies for case 1 (clean income)**

`fixtures/docs/case1_w2_2025.txt`, `case1_w2_2024.txt`, `case1_1040_2025.txt`. Realistic field labels, consistent employer name across W-2 and 1040, all amounts comfortably above $200,000. Every file carries a first line: `SYNTHETIC SPECIMEN — NOT A REAL TAX DOCUMENT`.

- [ ] **Step 2: Write case 4's forgery as an ARITHMETIC forgery**

`fixtures/docs/case4_bank_statement.txt`. The catch must survive a text-only path, so it cannot be font or alignment. Make the numbers betray it:

```
SYNTHETIC SPECIMEN — NOT A REAL BANK STATEMENT
Statement period: 2026-08-01 to 2026-08-31
Opening balance:        1,204,330.00
Total deposits:            18,400.00
Total withdrawals:         22,100.00
Closing balance:        1,340,630.00     <-- does not follow from the above
Statement generated:    2026-07-14       <-- predates the period it reports
```

Two independent, stateable inconsistencies: the closing balance does not reconcile, and the generation date precedes the statement period. A challenger told to look for `face_arithmetic_error` will find both.

- [ ] **Step 3: Write case 5 as a TEMPORAL conflict — this is the showpiece**

The original `$199,400` beat was a coin flip: all three models would likely notice it was under $200,000, and because 199,400 sits inside the 5% near-threshold band, triage would have returned `needs_review` for a *boring* reason — making a misfire invisible. Replace it with a conflict the validator is genuinely better at than a model:

`fixtures/docs/case5_1040_2025.txt`:
```
SYNTHETIC SPECIMEN — NOT A REAL TAX DOCUMENT
Tax year: 2025
Filing status: Single
Total income ................ 212,000
Adjusted gross income ....... 185,000
```
`fixtures/docs/case5_w2_2025.txt` → wages `240,000` (tax year 2025)
`fixtures/docs/case5_w2_2024.txt` → wages `185,000` (tax year 2024)

Models routinely approve this — by averaging the two years, or by reading "total income $212,000" instead of the 2024 figure. `INCOME` fails deterministically because 501(a)(6) requires the threshold in **each** of the two most recent years, and $185,000 in 2024 is 7.5% below $200,000 — comfortably outside the near-threshold band, so the conflict branch fires cleanly rather than being masked. It also survives a judge saying "re-run it."

- [ ] **Step 4: Case 2 (license) carries NO financial documents**

The BrokerCheck lookup needs a **real public CRD record** to return anything. Do not attach synthetic income documents to a real, named, licensed person — that is the one thing tonight that could genuinely embarrass the team. Case 2 claims the license path only, carries that person's real public license data and nothing else, and asserts nothing financial about them. **Better still: use a consenting teammate who holds a CRD.**

- [ ] **Step 5: Case 3 (entity) names a company present in the akta cache**

Entity LLC subscribing, `subject_type: "entity"`, `claimed_path: "entity_assets"`, with `entity_domain` matching the unresolvable shell entry built in Task 11.

- [ ] **Step 6: Commit**

```bash
git add fixtures/
git commit -m "feat: five synthetic demo fixtures incl. arithmetic forgery and temporal conflict"
```

---

## Task 3: Skeleton, models, disk-backed store, mocked contract

**Time box: 35 min.** Unblocks the frontend engineer permanently.

**Files:**
- Create: `app/models.py`, `app/store.py`, `app/main.py`, `requirements.txt`, `.env.example`

**Interfaces:**
- Produces: all models below; `store.save(case)`, `store.get(case_id) -> Case | None`, `store.all() -> list[Case]`; routes `POST /cases`, `POST /cases/{id}/documents`, `POST /cases/{id}/run`, `GET /cases/{id}`, `GET /cases`, `GET /cases/{id}/letter`

- [ ] **Step 1: Write `requirements.txt`**

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

- [ ] **Step 2: Write `app/models.py`**

```python
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field as PydField

SubjectType = Literal["individual", "entity"]
ClaimedPath = Literal["income", "net_worth", "license", "entity_assets", "min_investment"]
Decision = Literal["auto_approved", "needs_review", "rejected", "needs_documents", "pending"]
Outcome = Literal["PASS", "FAIL", "INSUFFICIENT_DATA"]


class Field(BaseModel):
    value: Any
    confidence: float
    source_quote: str = ""
    doc_id: str = ""
    disputed: bool = False


class Document(BaseModel):
    doc_id: str
    filename: str
    doc_type: str = "unknown"
    text: Optional[str] = None
    image_b64: Optional[str] = None


class Challenge(BaseModel):
    field_name: str
    failure_mode: str
    reason: str


class Resolution(BaseModel):
    field_name: str
    action: Literal["CONCEDE", "DEFEND"]
    revised_value: Any = None
    justification: str


class DebateTurn(BaseModel):
    round: int
    actor: Literal["extractor", "challenger", "adjudicator"]
    model: str
    fields: dict[str, Field] = PydField(default_factory=dict)
    challenges: list[Challenge] = PydField(default_factory=list)
    resolutions: list[Resolution] = PydField(default_factory=list)


class AgentRecommendation(BaseModel):
    decision: Literal["APPROVE", "DENY", "INSUFFICIENT"]
    trust_assessment: str
    reasoning: str
    open_disputes: list[str] = PydField(default_factory=list)


class RuleResult(BaseModel):
    rule_id: str
    citation: str
    outcome: Outcome
    inputs_used: dict[str, Any] = PydField(default_factory=dict)
    reason: str


class Attestations(BaseModel):
    """Written representations the investor must make. 506(c)'s safe harbors require
    these in addition to documents — collecting them IS part of 'reasonable steps'
    (plan.md §1), and three validator rules are unsatisfiable without them."""
    current_year_income_expectation: bool = False
    liabilities_complete: bool = False
    funds_not_third_party_financed: bool = False


class AuditEvent(BaseModel):
    ts: str
    stage: str
    actor: str
    summary: str
    trace_id: str = ""


class Case(BaseModel):
    case_id: str
    subject_type: SubjectType
    claimed_path: ClaimedPath
    subject_name: str = ""
    entity_domain: Optional[str] = None
    crd_number: Optional[str] = None
    commitment_usd: Optional[int] = None
    attestations: Attestations = PydField(default_factory=Attestations)
    documents: list[Document] = PydField(default_factory=list)
    debate: list[DebateTurn] = PydField(default_factory=list)
    extracted: dict[str, Field] = PydField(default_factory=dict)
    evidence: dict[str, Any] = PydField(default_factory=dict)
    recommendation: Optional[AgentRecommendation] = None
    validation: list[RuleResult] = PydField(default_factory=list)
    conflict: bool = False
    decision: Decision = "pending"
    decision_reason: str = ""
    audit_trail: list[AuditEvent] = PydField(default_factory=list)
    letter_md: Optional[str] = None
    trace_url: Optional[str] = None


class CreateCaseRequest(BaseModel):
    subject_type: SubjectType
    claimed_path: ClaimedPath
    subject_name: str = ""
    entity_domain: Optional[str] = None
    crd_number: Optional[str] = None
    commitment_usd: Optional[int] = None
    attestations: Attestations = PydField(default_factory=Attestations)
```

- [ ] **Step 3: Write `app/store.py` — cases survive a server restart**

Without this, every `uvicorn --reload` wipes the frontend dev's test cases, which is the real tax on working in parallel.

```python
import pathlib
from app.models import Case

DIR = pathlib.Path("fixtures/live_cases")
DIR.mkdir(parents=True, exist_ok=True)


def _path(case_id: str) -> pathlib.Path:
    return DIR / f"{case_id}.json"


def save(case: Case) -> None:
    _path(case.case_id).write_text(case.model_dump_json(indent=2))


def get(case_id: str) -> Case | None:
    p = _path(case_id)
    if not p.exists():
        return None
    return Case.model_validate_json(p.read_text())


def all() -> list[Case]:
    out = []
    for p in sorted(DIR.glob("case_*.json")):
        try:
            out.append(Case.model_validate_json(p.read_text()))
        except Exception:
            continue
    return out
```

- [ ] **Step 4: Write `app/main.py`**

```python
import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app import store
from app.models import Case, CreateCaseRequest, Document

app = FastAPI(title="Accredited Investor Verification")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _require(case_id: str) -> Case:
    case = store.get(case_id)
    if case is None:
        raise HTTPException(404, "case not found")
    return case


@app.post("/cases")
def create_case(req: CreateCaseRequest):
    case_id = f"case_{uuid.uuid4().hex[:8]}"
    store.save(Case(case_id=case_id, **req.model_dump()))
    return {"case_id": case_id}


@app.post("/cases/{case_id}/documents")
async def upload_document(case_id: str, file: UploadFile = File(...)):
    case = _require(case_id)
    raw = await file.read()
    doc = Document(doc_id=f"doc_{uuid.uuid4().hex[:6]}", filename=file.filename,
                   text=raw.decode("utf-8", errors="replace"))
    case.documents.append(doc)
    store.save(case)
    return {"doc_id": doc.doc_id, "doc_type": doc.doc_type}


@app.get("/cases/{case_id}")
def get_case(case_id: str):
    return _require(case_id)


@app.get("/cases")
def list_cases():
    return [{"case_id": c.case_id, "subject_name": c.subject_name,
             "claimed_path": c.claimed_path, "decision": c.decision,
             "conflict": c.conflict} for c in store.all()]


@app.get("/cases/{case_id}/letter")
def get_letter(case_id: str):
    case = _require(case_id)
    return {"letter_md": case.letter_md, "trace_url": case.trace_url}


@app.post("/cases/{case_id}/run")
def run_mock(case_id: str):
    """Replaced by the real SSE pipeline in Task 12. Returns the stored case now so
    the frontend can build against a realistic payload immediately."""
    return _require(case_id)
```

- [ ] **Step 5: Verify the contract and that it survives a restart**

```bash
uvicorn app.main:app --reload --port 8000 &
ID=$(curl -s -X POST localhost:8000/cases -H 'Content-Type: application/json' \
  -d '{"subject_type":"individual","claimed_path":"income","subject_name":"Jane Specimen"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['case_id'])")
# restart the server, then:
curl -s localhost:8000/cases/$ID | head -5
```
Expected: the case still resolves after the restart.

- [ ] **Step 6: Commit, then tell the frontend engineer the contract is frozen**

```bash
git add requirements.txt .env.example app/
git commit -m "feat: API contract, domain models, disk-backed case store"
```

---

## Task 4: PRISM tracing (wire before anything else exists)

**Time box: 25 min.** Retrofitting tracing is miserable. Note the provisioning order above — the `DEALFLOW` credit needs a first trace to have already landed.

**Files:**
- Create: `app/tracing.py`
- Modify: `app/main.py` (call `init_tracing()` at import)

**Interfaces:**
- Produces: `init_tracing() -> None`, `span(name, **attrs)` context manager yielding an object with `.set(**attrs)`, `current_trace_url() -> str | None`

- [ ] **Step 1: Install**

Run: `pip install prismtrace-sdk`
If it does not resolve in 5 minutes: `pip install opentelemetry-sdk opentelemetry-exporter-otlp` and point the OTLP exporter at PRISM per `blockconvey.com/docs`.

- [ ] **Step 2: Write `app/tracing.py` with a no-op fallback**

```python
import os, contextlib, logging

log = logging.getLogger("audit")
_ENABLED = False
_tracer = None


def init_tracing() -> None:
    """Tracing is passive — its failure must never break the pipeline."""
    global _ENABLED, _tracer
    key = os.getenv("PRISMTRACE_API_KEY")
    if not key:
        log.warning("PRISMTRACE_API_KEY unset; audit trail is local-only")
        return
    try:
        from prismtrace import Tracer  # adjust to the SDK's real import
        _tracer = Tracer(api_key=key, service="accredited-verification")
        _ENABLED = True
    except Exception as e:
        log.warning("PRISM init failed (%s); audit trail is local-only", e)


class _Span:
    def __init__(self, inner):
        self._inner = inner

    def set(self, **attrs):
        if self._inner is not None:
            try:
                self._inner.set_attributes(attrs)
            except Exception:
                pass
        log.info("span-attrs %s", attrs)


@contextlib.contextmanager
def span(name: str, **attrs):
    if not _ENABLED:
        log.info("span-start %s %s", name, attrs)
        yield _Span(None)
        log.info("span-end %s", name)
        return
    try:
        with _tracer.start_span(name, attributes=attrs) as s:
            yield _Span(s)
    except Exception:
        yield _Span(None)


def current_trace_url() -> str | None:
    if not _ENABLED:
        return None
    try:
        return _tracer.current_trace_url()
    except Exception:
        return None
```

- [ ] **Step 3: Land a first trace — this unlocks the DEALFLOW credit**

```python
# scratch_trace.py
from app.tracing import init_tracing, span
init_tracing()
with span("smoke.test", case_id="case_demo", stage="smoke") as s:
    s.set(result="ok")
print("sent")
```
Run it, confirm the span appears in the PRISM dashboard, **then** redeem `DEALFLOW` under Settings → Billing & usage. If the span never appears within the time box, keep the local-logging path — `tracing.py`'s interface is identical either way.

- [ ] **Step 4: Commit**

```bash
git add app/tracing.py app/main.py && git commit -m "feat: PRISM tracing with local-logging fallback"
```

---

## Task 5: SPIKE — can Solari load BrokerCheck? (15 min, decision only)

Do this early. It is the flakiest integration; discovering it is unusable at hour five is fatal.

- [ ] **Step 1: Read the Solari docs** (PDF linked in `resources.md`; redeem `VC-HACK1MO-DNNXSYYM` first)

- [ ] **Step 2: Drive one cloud browser to BrokerCheck**

Navigate to `https://brokercheck.finra.org/`, search the real CRD chosen in Task 2 step 4, screenshot, return page text. **Time the round trip.**

- [ ] **Step 3: Record the decision**

| Outcome | Action |
|---|---|
| Works under ~30s | Wire live in Task 10 with cache fallback |
| Works but slow/flaky | Cache-first; live call only as background refresh |
| Cannot reach it | Pre-record the browser session, serve a cached `license_check`. Solari is still genuinely integrated — the call is real, just made ahead of time. Say that plainly on stage. |

---

## Task 6: Nicrron client and document classification

**Time box: 30 min.**

**Files:**
- Create: `app/nicrron.py`, `tests/test_nicrron.py`

**Interfaces:**
- Produces: `EXTRACTOR_MODEL`, `CHALLENGER_MODEL`, `ADJUDICATOR_MODEL`, `CLASSIFIER_MODEL`, `VISION_ENABLED`, `complete_json(model, system, user, image_b64=None) -> dict`, `classify_document(doc: Document) -> str`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_nicrron.py
import pytest
from app.nicrron import _coerce_json, CHALLENGER_MODEL, EXTRACTOR_MODEL

def test_coerce_json_strips_markdown_fence():
    assert _coerce_json('```json\n{"doc_type": "w2"}\n```') == {"doc_type": "w2"}

def test_coerce_json_recovers_json_embedded_in_prose():
    assert _coerce_json('Sure! {"doc_type": "1040"} hope that helps')["doc_type"] == "1040"

def test_coerce_json_raises_on_garbage():
    with pytest.raises(ValueError):
        _coerce_json("I cannot help with that.")

def test_challenger_is_a_different_vendor_than_extractor():
    """Cross-vendor independence is the design's core claim. Same vendor twice
    shares blind spots and the review becomes a rubber stamp."""
    assert EXTRACTOR_MODEL.split("/")[0] != CHALLENGER_MODEL.split("/")[0]
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pytest tests/test_nicrron.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.nicrron'`

- [ ] **Step 3: Write `app/nicrron.py`**

```python
import json, os, re
from openai import OpenAI
from app.models import Document
from app.tracing import span

BASE_URL = "https://api.nicrron.ai/v1"
EXTRACTOR_MODEL = "openai/gpt-6-luna"
CHALLENGER_MODEL = "anthropic/claude-sonnet-5"   # MUST be a different vendor
ADJUDICATOR_MODEL = "openai/gpt-6-astra"
CLASSIFIER_MODEL = "openai/gpt-6-luna"
VISION_ENABLED = os.getenv("VISION_ENABLED", "0") == "1"

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _coerce_json(raw: str) -> dict:
    cleaned = _FENCE.sub("", raw).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start:end + 1])
            except json.JSONDecodeError:
                pass
        raise ValueError(f"model did not return JSON: {raw[:200]}") from e


def client() -> OpenAI:
    return OpenAI(base_url=BASE_URL, api_key=os.environ["NICRRON_API_KEY"])


def complete_json(model: str, system: str, user: str, image_b64: str | None = None) -> dict:
    content: list | str = user
    if image_b64 and VISION_ENABLED:
        content = [{"type": "text", "text": user},
                   {"type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{image_b64}"}}]
    with span("nicrron.call", model=model, vision=bool(image_b64 and VISION_ENABLED)) as s:
        r = client().chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": content}],
            temperature=0,
        )
        out = _coerce_json(r.choices[0].message.content or "")
        if r.usage:
            s.set(prompt_tokens=r.usage.prompt_tokens,
                  completion_tokens=r.usage.completion_tokens)
        return out


DOC_TYPES = ["w2", "1040", "bank_statement", "brokerage_statement",
             "cpa_letter", "trust_deed", "unknown"]


def classify_document(doc: Document) -> str:
    out = complete_json(
        CLASSIFIER_MODEL,
        "You classify financial documents. Reply with JSON only.",
        f"Classify this document as exactly one of {DOC_TYPES}. "
        f'Reply {{"doc_type": "<one of the list>"}}.\n\n'
        f"Filename: {doc.filename}\n\n{(doc.text or '')[:4000]}",
        image_b64=doc.image_b64,
    )
    dt = out.get("doc_type", "unknown")
    return dt if dt in DOC_TYPES else "unknown"
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_nicrron.py -v` → 4 passed

- [ ] **Step 5: Smoke-check a real call**

Run: `python -c "from app.nicrron import complete_json, CLASSIFIER_MODEL; print(complete_json(CLASSIFIER_MODEL,'Reply JSON only.','Reply {\"ok\": true}'))"`
Expected: `{'ok': True}`. 401 = key unset. 402 = credits never redeemed.

- [ ] **Step 6: Commit**

```bash
git add app/nicrron.py tests/test_nicrron.py
git commit -m "feat: Nicrron client, JSON coercion, document classification"
```

---

## Task 7: The adversarial debate over the document set

**Time box: 90 min.** The centerpiece. Plain function calls — Roundtable layers on in Task 13.

**One debate per case, over all documents at once.** Two reasons: a per-document challenger cannot detect `cross_document_inconsistency` (W-2 employer ≠ 1040), which is one of its own named failure modes and is exactly what cases 1 and 5 turn on; and per-document multiplies calls ~3×, which on venue WiFi is the difference between a demo and a progress bar.

**Files:**
- Create: `app/debate.py`, `tests/test_debate.py`

**Interfaces:**
- Consumes: `app.models.{Document, Field, Challenge, Resolution, DebateTurn, AgentRecommendation}`, `app.nicrron.{complete_json, EXTRACTOR_MODEL, CHALLENGER_MODEL, ADJUDICATOR_MODEL, VISION_ENABLED}`
- Produces: `failure_modes() -> list[str]`, `run_debate(docs: list[Document]) -> DebateResult` with `.turns`, `.fields`, `.recommendation`

- [ ] **Step 1: Write the failing orchestration tests**

The loop is tested with stubbed model calls — that is the only deterministically testable part.

```python
# tests/test_debate.py
from unittest.mock import patch
from app.models import Document
from app import debate

DOCS = [
    Document(doc_id="d1", filename="w2_2025.txt", doc_type="w2",
             text="Box 1 Wages: $240,000  Tax year 2025  Employer: Acme Corp"),
    Document(doc_id="d2", filename="w2_2024.txt", doc_type="w2",
             text="Box 1 Wages: $185,000  Tax year 2024  Employer: Acme Corp"),
]

R1 = {"fields": {
    "income_year_1": {"value": 240000, "confidence": 0.95, "source_quote": "$240,000"},
    "income_year_2": {"value": 185000, "confidence": 0.94, "source_quote": "$185,000"}}}
R2 = {"challenges": [{"field_name": "income_year_2", "failure_mode": "wrong_field",
                      "reason": "2024 wages may exclude bonus income"}]}
R3 = {"resolutions": [{"field_name": "income_year_2", "action": "DEFEND",
                       "revised_value": None, "justification": "Box 1 is the stated figure"}]}
R4 = {"fields": R1["fields"],
      "recommendation": {"decision": "APPROVE", "trust_assessment": "consistent",
                         "reasoning": "Two-year average exceeds the threshold",
                         "open_disputes": []}}


def test_run_debate_produces_four_turns_in_order():
    with patch.object(debate, "complete_json", side_effect=[R1, R2, R3, R4]):
        result = debate.run_debate(DOCS)
    assert [t.round for t in result.turns] == [1, 2, 3, 4]
    assert [t.actor for t in result.turns] == [
        "extractor", "challenger", "extractor", "adjudicator"]


def test_one_debate_covers_all_documents_not_one_per_document():
    """Four calls total for two documents — not eight."""
    with patch.object(debate, "complete_json", side_effect=[R1, R2, R3, R4]) as m:
        debate.run_debate(DOCS)
    assert m.call_count == 4


def test_all_document_text_reaches_the_challenger():
    with patch.object(debate, "complete_json", side_effect=[R1, R2, R3, R4]) as m:
        debate.run_debate(DOCS)
    challenger_prompt = m.call_args_list[1].args[2]
    assert "240,000" in challenger_prompt and "185,000" in challenger_prompt


def test_challenged_field_is_marked_disputed():
    with patch.object(debate, "complete_json", side_effect=[R1, R2, R3, R4]):
        result = debate.run_debate(DOCS)
    assert result.fields["income_year_2"].disputed is True


def test_conceded_value_replaces_the_original():
    r3 = {"resolutions": [{"field_name": "income_year_2", "action": "CONCEDE",
                           "revised_value": 165000, "justification": "Misread"}]}
    r4 = {"fields": {"income_year_2": {"value": 165000, "confidence": 0.9,
                                       "source_quote": "$165,000"}},
          "recommendation": {"decision": "DENY", "trust_assessment": "revised",
                             "reasoning": "Below threshold", "open_disputes": []}}
    with patch.object(debate, "complete_json", side_effect=[R1, R2, r3, r4]):
        result = debate.run_debate(DOCS)
    assert result.fields["income_year_2"].value == 165000
    assert result.recommendation.decision == "DENY"


def test_round3_is_skipped_when_there_are_no_challenges():
    no_challenges = {"challenges": []}
    with patch.object(debate, "complete_json",
                      side_effect=[R1, no_challenges, R4]) as m:
        result = debate.run_debate(DOCS)
    assert m.call_count == 3
    assert result.recommendation.decision == "APPROVE"


def test_alteration_failure_mode_is_absent_without_vision():
    """Text-only: asking for font/alignment evidence invites hallucination."""
    with patch.object(debate, "VISION_ENABLED", False):
        assert "signs_of_alteration" not in debate.failure_modes()


def test_alteration_failure_mode_is_present_with_vision():
    with patch.object(debate, "VISION_ENABLED", True):
        assert "signs_of_alteration" in debate.failure_modes()
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pytest tests/test_debate.py -v`
Expected: FAIL — `AttributeError: module 'app.debate' has no attribute 'run_debate'`

- [ ] **Step 3: Write `app/debate.py`**

```python
from dataclasses import dataclass, field as dc_field
from app.models import (Document, Field, Challenge, Resolution,
                        DebateTurn, AgentRecommendation)
from app.nicrron import (complete_json, EXTRACTOR_MODEL, CHALLENGER_MODEL,
                         ADJUDICATOR_MODEL, VISION_ENABLED)
from app.tracing import span

TEXT_FAILURE_MODES = [
    "misread_or_transposed_digits",
    "wrong_field",                   # AGI vs total income vs wages
    "stale_or_wrong_tax_year",
    "cross_document_inconsistency",  # only detectable because all docs are in one debate
    "face_arithmetic_error",         # totals that do not reconcile
    "impossible_dates",              # e.g. generated before the period it reports
    "unsupported_inference",         # a field no document states
]
VISION_ONLY_FAILURE_MODES = ["signs_of_alteration"]   # font/alignment — needs pixels


def failure_modes() -> list[str]:
    return TEXT_FAILURE_MODES + (VISION_ONLY_FAILURE_MODES if VISION_ENABLED else [])


TARGET_FIELDS = [
    "income_year_1", "income_year_2", "income_current_year_expectation",
    "filing_status", "total_assets", "total_liabilities",
    "primary_residence_value", "primary_residence_debt",
    "residence_debt_added_last_60_days",
    "entity_total_assets", "entity_total_investments",
    "employer_name", "institution", "tax_year", "statement_date",
]


@dataclass
class DebateResult:
    turns: list[DebateTurn] = dc_field(default_factory=list)
    fields: dict[str, Field] = dc_field(default_factory=dict)
    recommendation: AgentRecommendation | None = None


def _parse_fields(raw: dict) -> dict[str, Field]:
    out = {}
    for name, f in (raw.get("fields") or {}).items():
        if not isinstance(f, dict):
            continue
        out[name] = Field(value=f.get("value"),
                          confidence=float(f.get("confidence", 0.0)),
                          source_quote=str(f.get("source_quote", "")),
                          doc_id=str(f.get("doc_id", "")))
    return out


def _payload(docs: list[Document]) -> str:
    parts = []
    for d in docs:
        parts.append(f"--- DOCUMENT {d.doc_id} | type={d.doc_type} | {d.filename} ---\n"
                     f"{(d.text or '(image attached)')[:4000]}")
    return "\n\n".join(parts)


def _first_image(docs: list[Document]) -> str | None:
    if not VISION_ENABLED:
        return None
    return next((d.image_b64 for d in docs if d.image_b64), None)


def round1_extract(docs: list[Document]) -> dict[str, Field]:
    raw = complete_json(
        EXTRACTOR_MODEL,
        "You extract financial facts from investor documents. Reply with JSON only. "
        "Never guess: if the documents do not state a value, omit the field entirely.",
        f"Extract any of these fields that the documents state: {TARGET_FIELDS}.\n"
        "income_year_1 is the MOST RECENT completed year; income_year_2 is the year "
        "before it. Report each year separately — never average them.\n"
        'Reply {"fields": {"<name>": {"value": <number|string>, "confidence": '
        '<0.0-1.0>, "source_quote": "<exact text>", "doc_id": "<which document>"}}}.\n'
        "confidence reflects certainty you read the correct value from the correct "
        "field.\n\n" + _payload(docs),
        image_b64=_first_image(docs))
    return _parse_fields(raw)


def round2_challenge(docs: list[Document], fields: dict[str, Field]) -> list[Challenge]:
    summary = {k: {"value": v.value, "confidence": v.confidence,
                   "source_quote": v.source_quote, "doc_id": v.doc_id}
               for k, v in fields.items()}
    raw = complete_json(
        CHALLENGER_MODEL,
        "You are an adversarial reviewer auditing another model's extraction from "
        "investor documents, for an SEC accredited-investor determination. Your job "
        "is to find errors, not to agree. Reply with JSON only.",
        f"Another model extracted: {summary}\n\n"
        f"Check specifically for these failure modes: {failure_modes()}\n\n"
        "You can see ALL the documents, so check them against each other: do employer "
        "names, tax years, institutions and totals agree? Do stated totals reconcile "
        "with their components? Are any dates impossible?\n\n"
        "Raise a challenge ONLY where you have a specific reason you can state and "
        "tie to the document text. Do not raise vague doubts. If the extraction is "
        'sound, return an empty list.\nReply {"challenges": [{"field_name": "...", '
        '"failure_mode": "<one of the list>", "reason": "<specific>"}]}.\n\n'
        + _payload(docs),
        image_b64=_first_image(docs))
    return [Challenge(**c) for c in (raw.get("challenges") or [])
            if isinstance(c, dict) and c.get("field_name")]


def round3_respond(docs: list[Document], fields: dict[str, Field],
                   challenges: list[Challenge]) -> list[Resolution]:
    raw = complete_json(
        EXTRACTOR_MODEL,
        "You are defending your extraction against an auditor. Concede when the "
        "auditor is right. Reply with JSON only.",
        f"Your extraction: { {k: v.value for k, v in fields.items()} }\n"
        f"Challenges: {[c.model_dump() for c in challenges]}\n\n"
        'For each challenge reply {"resolutions": [{"field_name": "...", "action": '
        '"CONCEDE" or "DEFEND", "revised_value": <value|null>, "justification": '
        '"..."}]}. CONCEDE requires a revised_value.\n\n' + _payload(docs),
        image_b64=_first_image(docs))
    out = []
    for r in (raw.get("resolutions") or []):
        if isinstance(r, dict) and r.get("action") in ("CONCEDE", "DEFEND"):
            out.append(Resolution(field_name=r.get("field_name", ""),
                                  action=r["action"],
                                  revised_value=r.get("revised_value"),
                                  justification=str(r.get("justification", ""))))
    return out


def round4_adjudicate(docs: list[Document], fields: dict[str, Field],
                      challenges: list[Challenge], resolutions: list[Resolution]
                      ) -> tuple[dict[str, Field], AgentRecommendation]:
    raw = complete_json(
        ADJUDICATOR_MODEL,
        "You adjudicate a dispute between an extractor and an auditor over investor "
        "documents, for an SEC accredited-investor determination. Reply with JSON "
        "only. You decide the final field values and whether the documents are "
        "trustworthy. You do NOT apply dollar thresholds — a separate deterministic "
        "validator does that.",
        f"Extraction: { {k: v.model_dump() for k, v in fields.items()} }\n"
        f"Challenges: {[c.model_dump() for c in challenges]}\n"
        f"Responses: {[r.model_dump() for r in resolutions]}\n\n"
        'Reply {"fields": {...same shape as extraction...}, "recommendation": '
        '{"decision": "APPROVE"|"DENY"|"INSUFFICIENT", "trust_assessment": "...", '
        '"reasoning": "...", "open_disputes": ["field_name", ...]}}.\n'
        "APPROVE means the documents credibly support the investor's claim. List any "
        "challenge you could not resolve in open_disputes.\n\n" + _payload(docs),
        image_b64=_first_image(docs))
    final = _parse_fields(raw) or fields
    rec_raw = raw.get("recommendation") or {}
    rec = AgentRecommendation(
        decision=rec_raw.get("decision", "INSUFFICIENT"),
        trust_assessment=str(rec_raw.get("trust_assessment", "")),
        reasoning=str(rec_raw.get("reasoning", "")),
        open_disputes=[str(d) for d in (rec_raw.get("open_disputes") or [])])
    if rec.decision not in ("APPROVE", "DENY", "INSUFFICIENT"):
        rec.decision = "INSUFFICIENT"
    return final, rec


def run_debate(docs: list[Document]) -> DebateResult:
    res = DebateResult()
    doc_ids = [d.doc_id for d in docs]

    with span("debate.round1.extract", doc_count=len(docs)) as s:
        fields = round1_extract(docs)
        s.set(field_count=len(fields),
              min_confidence=min([f.confidence for f in fields.values()], default=0.0))
    res.turns.append(DebateTurn(round=1, actor="extractor",
                                model=EXTRACTOR_MODEL, fields=fields))

    with span("debate.round2.challenge", doc_count=len(docs)) as s:
        challenges = round2_challenge(docs, fields)
        s.set(challenge_count=len(challenges),
              fields_challenged=[c.field_name for c in challenges])
    res.turns.append(DebateTurn(round=2, actor="challenger",
                                model=CHALLENGER_MODEL, challenges=challenges))

    resolutions: list[Resolution] = []
    if challenges:
        with span("debate.round3.respond") as s:
            resolutions = round3_respond(docs, fields, challenges)
            s.set(conceded=sum(r.action == "CONCEDE" for r in resolutions),
                  defended=sum(r.action == "DEFEND" for r in resolutions))
        res.turns.append(DebateTurn(round=3, actor="extractor",
                                    model=EXTRACTOR_MODEL, resolutions=resolutions))
        for r in resolutions:
            if (r.action == "CONCEDE" and r.field_name in fields
                    and r.revised_value is not None):
                fields[r.field_name].value = r.revised_value

    with span("debate.round4.adjudicate") as s:
        final, rec = round4_adjudicate(docs, fields, challenges, resolutions)
        s.set(recommendation=rec.decision, disputes_open=len(rec.open_disputes))
    res.turns.append(DebateTurn(round=4, actor="adjudicator",
                                model=ADJUDICATOR_MODEL, fields=final))

    challenged = {c.field_name for c in challenges}
    for name, f in final.items():
        if name in challenged:
            f.disputed = True
        if not f.doc_id and doc_ids:
            f.doc_id = doc_ids[0]

    res.fields, res.recommendation = final, rec
    return res
```

Note the round numbering: when there are no challenges, round 3 is skipped and the adjudicator still reports as round 4. The test `test_round3_is_skipped_when_there_are_no_challenges` pins that behavior.

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_debate.py -v` → 8 passed

- [ ] **Step 5: Run one real debate against the case 5 fixture and TIME it**

```bash
python -c "
import time, pathlib
from app.models import Document
from app.debate import run_debate
docs = [Document(doc_id=f'd{i}', filename=p.name, doc_type='w2' if 'w2' in p.name else '1040',
                 text=p.read_text())
        for i, p in enumerate(sorted(pathlib.Path('fixtures/docs').glob('case5_*')))]
t = time.time(); r = run_debate(docs); el = time.time() - t
print(f'{el:.1f}s, {len(r.turns)} turns')
print({k: v.value for k, v in r.fields.items()})
print(r.recommendation.decision, '|', r.recommendation.reasoning[:160])
"
```
Expected: 3–4 turns and ideally `APPROVE` (the agents averaging the two years is exactly the behavior case 5 exploits). **If this exceeds ~25s, plan on playing the demo from cache** with one short live run as the honesty beat — decide that now, not at hour five.

- [ ] **Step 6: Commit**

```bash
git add app/debate.py tests/test_debate.py
git commit -m "feat: cross-vendor adversarial debate over the full document set"
```

---

## Task 8: Deterministic validator (TDD, strict)

**Time box: 35 min.** Pure functions; demo case 5 lands here. Test first, no exceptions.

**Files:**
- Create: `app/validator.py`, `tests/test_validator.py`

**Interfaces:**
- Consumes: `app.models.{Case, Field, RuleResult, Attestations}`
- Produces: `INDIVIDUAL_INCOME`, `JOINT_INCOME`, `NET_WORTH_MIN`, `ENTITY_ASSETS_MIN`, `validate(case) -> list[RuleResult]`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_validator.py
from app.models import Case, Field, Attestations
from app.validator import validate


def _case(path="income", subject="individual", attest=None, **fields):
    return Case(case_id="c1", subject_type=subject, claimed_path=path,
                attestations=attest or Attestations(
                    current_year_income_expectation=True,
                    liabilities_complete=True,
                    funds_not_third_party_financed=True),
                extracted={k: Field(value=v, confidence=0.95)
                           for k, v in fields.items()})


def _rule(results, rule_id):
    return next(r for r in results if r.rule_id == rule_id)


def test_income_passes_when_both_years_above_threshold():
    r = _rule(validate(_case(income_year_1=240000, income_year_2=230000,
                             income_current_year_expectation=240000)), "INCOME")
    assert r.outcome == "PASS"


def test_income_fails_when_the_earlier_year_is_below_threshold():
    """Demo case 5: agents approve by averaging; this must FAIL on 'each year'."""
    r = _rule(validate(_case(income_year_1=240000, income_year_2=185000,
                             income_current_year_expectation=240000)), "INCOME")
    assert r.outcome == "FAIL"
    assert 185000 in r.inputs_used.values()
    assert "each" in r.reason.lower()


def test_income_ignores_a_qualifying_two_year_average():
    r = _rule(validate(_case(income_year_1=300000, income_year_2=150000,
                             income_current_year_expectation=300000)), "INCOME")
    assert r.outcome == "FAIL"


def test_income_insufficient_when_a_year_is_missing():
    r = _rule(validate(_case(income_year_1=240000)), "INCOME")
    assert r.outcome == "INSUFFICIENT_DATA"


def test_income_requires_the_current_year_attestation():
    """506(c)'s income safe harbor needs a written representation of current-year
    expectation — no document contains it, so it must be collected at intake."""
    r = _rule(validate(_case(income_year_1=240000, income_year_2=230000,
                             income_current_year_expectation=240000,
                             attest=Attestations(current_year_income_expectation=False))),
              "INCOME")
    assert r.outcome == "INSUFFICIENT_DATA"
    assert "representation" in r.reason.lower()


def test_joint_filing_uses_the_300k_threshold():
    r = _rule(validate(_case(income_year_1=250000, income_year_2=260000,
                             income_current_year_expectation=250000,
                             filing_status="joint")), "INCOME")
    assert r.outcome == "FAIL"


def test_net_worth_excludes_primary_residence():
    r = _rule(validate(_case(path="net_worth", total_assets=1_600_000,
                             total_liabilities=200_000,
                             primary_residence_value=800_000,
                             primary_residence_debt=300_000)), "NET_WORTH")
    assert r.outcome == "FAIL"   # (1.6-0.8) - (0.2-0.3) = 0.9M


def test_net_worth_passes_above_one_million_excluding_residence():
    r = _rule(validate(_case(path="net_worth", total_assets=3_000_000,
                             total_liabilities=400_000,
                             primary_residence_value=900_000,
                             primary_residence_debt=600_000)), "NET_WORTH")
    assert r.outcome == "PASS"


def test_net_worth_requires_the_liabilities_attestation():
    r = _rule(validate(_case(path="net_worth", total_assets=3_000_000,
                             total_liabilities=400_000,
                             attest=Attestations(liabilities_complete=False))),
              "NET_WORTH")
    assert r.outcome == "INSUFFICIENT_DATA"


def test_license_reads_solari_evidence():
    c = _case(path="license")
    c.evidence["license_check"] = {"licenses": ["Series 65"], "active": True}
    assert _rule(validate(c), "LICENSE").outcome == "PASS"


def test_license_fails_when_inactive():
    c = _case(path="license")
    c.evidence["license_check"] = {"licenses": ["Series 65"], "active": False}
    assert _rule(validate(c), "LICENSE").outcome == "FAIL"


def test_min_investment_requires_the_financing_self_certification():
    c = _case(path="min_investment",
              attest=Attestations(funds_not_third_party_financed=False))
    c.commitment_usd = 250_000
    r = _rule(validate(c), "MIN_INVESTMENT")
    assert r.outcome == "FAIL"
    assert "self-certif" in r.reason.lower()


def test_shell_company_risk_runs_for_entities_only():
    individual = validate(_case())
    assert not any(r.rule_id == "SHELL_COMPANY_RISK" for r in individual)
    entity = _case(path="entity_assets", subject="entity", entity_total_assets=9_000_000)
    assert any(r.rule_id == "SHELL_COMPANY_RISK" for r in validate(entity))


def test_every_rule_result_carries_a_citation_and_a_reason():
    for r in validate(_case(income_year_1=240000, income_year_2=230000,
                            income_current_year_expectation=240000)):
        assert r.citation, f"{r.rule_id} has no citation"
        assert r.reason
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pytest tests/test_validator.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.validator'`

- [ ] **Step 3: Write `app/validator.py`**

```python
from typing import Any
from app.models import Case, RuleResult
from app.tracing import span

INDIVIDUAL_INCOME = 200_000
JOINT_INCOME = 300_000
NET_WORTH_MIN = 1_000_000
ENTITY_ASSETS_MIN = 5_000_000
MIN_INVEST_INDIVIDUAL = 200_000
MIN_INVEST_ENTITY = 1_000_000

CITATIONS = {
    "INCOME": "17 CFR 230.501(a)(6)",
    "NET_WORTH": "17 CFR 230.501(a)(5)",
    "LICENSE": "17 CFR 230.501(a)(10)",
    "ENTITY_ASSETS": "17 CFR 230.501(a)(3) / (a)(9)",
    "MIN_INVESTMENT": "SEC no-action letter, March 2025",
    "SHELL_COMPANY_RISK": "internal risk check — NOT a 501(a) test",
}

# SHELL_COMPANY_RISK is excluded from every accreditation outcome. Its PASS/FAIL
# describe corroboration quality only, and triage filters it out before deciding
# approval or rejection. It can route a case to human review, nothing else.
RISK_ONLY_RULES = {"SHELL_COMPANY_RISK"}


def _num(case: Case, name: str) -> float | None:
    f = case.extracted.get(name)
    if f is None or f.value is None:
        return None
    try:
        return float(str(f.value).replace(",", "").replace("$", ""))
    except (TypeError, ValueError):
        return None


def _result(rule_id: str, outcome: str, reason: str, inputs: dict[str, Any]) -> RuleResult:
    return RuleResult(rule_id=rule_id, citation=CITATIONS[rule_id],
                      outcome=outcome, inputs_used=inputs, reason=reason)


def check_income(case: Case) -> RuleResult:
    y1, y2 = _num(case, "income_year_1"), _num(case, "income_year_2")
    expectation = _num(case, "income_current_year_expectation")
    status_f = case.extracted.get("filing_status")
    joint = str(getattr(status_f, "value", "")).lower() == "joint"
    threshold = JOINT_INCOME if joint else INDIVIDUAL_INCOME
    attested = case.attestations.current_year_income_expectation
    inputs = {"income_year_1": y1, "income_year_2": y2,
              "income_current_year_expectation": expectation,
              "filing_status": "joint" if joint else "individual",
              "current_year_expectation_attested": attested,
              "threshold": threshold}

    if y1 is None or y2 is None:
        missing = [n for n, v in (("income_year_1", y1), ("income_year_2", y2))
                   if v is None]
        return _result("INCOME", "INSUFFICIENT_DATA",
                       f"Missing required prior-year income: {', '.join(missing)}.",
                       inputs)
    if not attested:
        return _result("INCOME", "INSUFFICIENT_DATA",
                       "Missing the investor's written representation of a reasonable "
                       "expectation of reaching the threshold in the current year, "
                       "which 501(a)(6) requires in addition to the two prior years.",
                       inputs)

    failed = [f"{n}=${v:,.0f}" for n, v in (("income_year_1", y1), ("income_year_2", y2))
              if v < threshold]
    if failed:
        return _result("INCOME", "FAIL",
                       f"501(a)(6) requires income of at least ${threshold:,} in EACH "
                       f"of the two most recent years — a two-year average does not "
                       f"qualify. Below threshold: {', '.join(failed)}.", inputs)
    return _result("INCOME", "PASS",
                   f"Income of at least ${threshold:,} in each of the two most recent "
                   f"years, with an attested expectation for the current year.", inputs)


def check_net_worth(case: Case) -> RuleResult:
    assets, liabilities = _num(case, "total_assets"), _num(case, "total_liabilities")
    res_val = _num(case, "primary_residence_value") or 0.0
    res_debt = _num(case, "primary_residence_debt") or 0.0
    recent_debt = _num(case, "residence_debt_added_last_60_days") or 0.0
    attested = case.attestations.liabilities_complete
    inputs = {"total_assets": assets, "total_liabilities": liabilities,
              "primary_residence_value": res_val, "primary_residence_debt": res_debt,
              "residence_debt_added_last_60_days": recent_debt,
              "liabilities_attested_complete": attested, "threshold": NET_WORTH_MIN}

    if assets is None or liabilities is None:
        return _result("NET_WORTH", "INSUFFICIENT_DATA",
                       "Missing total assets or total liabilities.", inputs)
    if not attested:
        return _result("NET_WORTH", "INSUFFICIENT_DATA",
                       "Missing the investor's written representation that all "
                       "liabilities have been disclosed. Without a consumer credit "
                       "report (out of scope), the net worth method cannot rely on "
                       "documents alone.", inputs)

    net = (assets - res_val) - (liabilities - res_debt) - recent_debt
    inputs["computed_net_worth_excluding_residence"] = net
    if net > NET_WORTH_MIN:
        return _result("NET_WORTH", "PASS",
                       f"Net worth excluding primary residence is ${net:,.0f}, above "
                       f"the ${NET_WORTH_MIN:,} threshold.", inputs)
    return _result("NET_WORTH", "FAIL",
                   f"Net worth excluding primary residence is ${net:,.0f}, at or below "
                   f"the ${NET_WORTH_MIN:,} threshold.", inputs)


def check_license(case: Case) -> RuleResult:
    ev = case.evidence.get("license_check")
    inputs = {"license_check": ev}
    if not ev:
        return _result("LICENSE", "INSUFFICIENT_DATA",
                       "No FINRA BrokerCheck result on file.", inputs)
    qualifying = {"Series 7", "Series 65", "Series 82"}
    held = [l for l in (ev.get("licenses") or []) if l in qualifying]
    if held and ev.get("active"):
        return _result("LICENSE", "PASS",
                       f"Holds {', '.join(held)} in good standing per FINRA "
                       f"BrokerCheck ({ev.get('source_url') or 'source unrecorded'}).",
                       inputs)
    return _result("LICENSE", "FAIL",
                   "No active Series 7, 65, or 82 registration found on BrokerCheck.",
                   inputs)


def check_entity_assets(case: Case) -> RuleResult:
    assets = _num(case, "entity_total_assets")
    investments = _num(case, "entity_total_investments")
    inputs = {"entity_total_assets": assets, "entity_total_investments": investments,
              "threshold": ENTITY_ASSETS_MIN}
    if assets is None and investments is None:
        return _result("ENTITY_ASSETS", "INSUFFICIENT_DATA",
                       "No entity asset or investment total on file.", inputs)
    best = max(v for v in (assets, investments) if v is not None)
    if best > ENTITY_ASSETS_MIN:
        return _result("ENTITY_ASSETS", "PASS",
                       f"Entity holds ${best:,.0f}, above the "
                       f"${ENTITY_ASSETS_MIN:,} threshold.", inputs)
    return _result("ENTITY_ASSETS", "FAIL",
                   f"Entity holds ${best:,.0f}, at or below the "
                   f"${ENTITY_ASSETS_MIN:,} threshold.", inputs)


def check_min_investment(case: Case) -> RuleResult:
    commitment = case.commitment_usd
    certified = case.attestations.funds_not_third_party_financed
    threshold = (MIN_INVEST_ENTITY if case.subject_type == "entity"
                 else MIN_INVEST_INDIVIDUAL)
    inputs = {"commitment_usd": commitment, "threshold": threshold,
              "funds_not_third_party_financed": certified}
    if commitment is None:
        return _result("MIN_INVESTMENT", "INSUFFICIENT_DATA",
                       "No commitment amount recorded.", inputs)
    if commitment >= threshold and certified:
        return _result("MIN_INVESTMENT", "PASS",
                       f"Commitment of ${commitment:,} meets the ${threshold:,} "
                       f"minimum and the investor self-certified that the funds are "
                       f"not third-party financed.", inputs)
    if commitment >= threshold:
        return _result("MIN_INVESTMENT", "FAIL",
                       "Commitment meets the minimum but the required written "
                       "self-certification that funds are not third-party financed "
                       "is missing.", inputs)
    return _result("MIN_INVESTMENT", "FAIL",
                   f"Commitment of ${commitment:,} is below the ${threshold:,} "
                   f"minimum.", inputs)


def check_shell_company_risk(case: Case) -> RuleResult:
    ev = case.evidence.get("entity_corroboration")
    inputs = {"entity_corroboration": ev}
    note = (" Corroboration signal only — akta.pro holds no individual-level or AUM "
            "data and cannot establish accredited status.")
    if not ev:
        return _result("SHELL_COMPANY_RISK", "INSUFFICIENT_DATA",
                       "No company corroboration data retrieved." + note, inputs)
    if not ev.get("resolved"):
        return _result("SHELL_COMPANY_RISK", "FAIL",
                       "Entity could not be resolved to a known company." + note, inputs)
    if not ev.get("operating_business_signal"):
        return _result("SHELL_COMPANY_RISK", "FAIL",
                       "Entity resolved but shows no operating-business signals "
                       "(headcount, hiring, web traffic)." + note, inputs)
    if ev.get("adverse_news"):
        return _result("SHELL_COMPANY_RISK", "FAIL",
                       f"{len(ev['adverse_news'])} adverse news item(s) found." + note,
                       inputs)
    return _result("SHELL_COMPANY_RISK", "PASS",
                   "Entity resolves to a company with operating signals and no "
                   "adverse news." + note, inputs)


PATH_RULES = {
    "income": [check_income],
    "net_worth": [check_net_worth],
    "license": [check_license],
    "entity_assets": [check_entity_assets],
    "min_investment": [check_min_investment],
}


def validate(case: Case) -> list[RuleResult]:
    results = [fn(case) for fn in PATH_RULES.get(case.claimed_path, [])]
    if case.subject_type == "entity":
        results.append(check_shell_company_risk(case))
    for r in results:
        with span(f"rule:{r.rule_id}", outcome=r.outcome, citation=r.citation) as s:
            s.set(inputs_used=str(r.inputs_used))
    return results
```

- [ ] **Step 4: Run tests until green**

Run: `pytest tests/test_validator.py -v` → 14 passed

- [ ] **Step 5: Commit**

```bash
git add app/validator.py tests/test_validator.py
git commit -m "feat: deterministic Rule 501(a) validator with attestations and citations"
```

---

## Task 9: Triage, conflict detection, and the PRISM guardrail (TDD, strict)

**Time box: 35 min.** Demo case 5 lands here. The PRISM guardrail is **promoted into this task** — it is the same logic the conflict check already writes, and it dramatizes case 5 directly, so deferring it to "if time remains" forfeited the PRISM track for no saving.

**Files:**
- Create: `app/triage.py`, `tests/test_triage.py`

**Interfaces:**
- Produces: `CONFIDENCE_THRESHOLD = 0.85`, `NEAR_THRESHOLD_PCT = 0.05`, `detect_conflict(case) -> bool`, `triage(case) -> tuple[str, str]`, `assert_issue_guardrail(case) -> None`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_triage.py
import pytest
from app.models import Case, Field, RuleResult, AgentRecommendation
from app.triage import triage, detect_conflict, assert_issue_guardrail


def _case(rec_decision, rule_outcome, confidence=0.95, inputs=None, disputes=None,
          rule_id="INCOME", subject="individual", path="income"):
    return Case(
        case_id="c1", subject_type=subject, claimed_path=path,
        extracted={"income_year_1": Field(value=240000, confidence=confidence)},
        recommendation=AgentRecommendation(
            decision=rec_decision, trust_assessment="", reasoning="",
            open_disputes=disputes or []),
        validation=[RuleResult(rule_id=rule_id, citation="17 CFR 230.501(a)(6)",
                               outcome=rule_outcome,
                               inputs_used=inputs or {"income_year_1": 240000,
                                                      "threshold": 200000},
                               reason="stub reason")])


def test_auto_approves_when_agents_and_validator_agree():
    assert triage(_case("APPROVE", "PASS"))[0] == "auto_approved"


def test_conflict_when_agents_approve_but_validator_fails():
    """Demo case 5 — the showpiece."""
    case = _case("APPROVE", "FAIL", inputs={"income_year_2": 185000,
                                            "threshold": 200000})
    assert detect_conflict(case) is True
    decision, reason = triage(case)
    assert decision == "needs_review"
    assert "conflict" in reason.lower()


def test_case5_values_are_outside_the_near_threshold_band():
    """185000 is 7.5% below 200000, so the conflict branch fires rather than being
    masked by the near-threshold rule. This is why the fixture uses 185000."""
    case = _case("APPROVE", "FAIL", inputs={"income_year_2": 185000,
                                            "threshold": 200000})
    _, reason = triage(case)
    assert "within" not in reason.lower()


def test_low_confidence_blocks_auto_approval():
    decision, reason = triage(_case("APPROVE", "PASS", confidence=0.70))
    assert decision == "needs_review"
    assert "confidence" in reason.lower()


def test_near_threshold_value_blocks_auto_approval():
    decision, reason = triage(_case("APPROVE", "PASS",
                                    inputs={"income_year_1": 205000,
                                            "threshold": 200000}))
    assert decision == "needs_review"
    assert "threshold" in reason.lower()


def test_open_dispute_blocks_auto_approval():
    decision, reason = triage(_case("APPROVE", "PASS", disputes=["income_year_1"]))
    assert decision == "needs_review"
    assert "dispute" in reason.lower()


def test_rejects_when_both_layers_say_no():
    assert triage(_case("DENY", "FAIL"))[0] == "rejected"


def test_entity_case_can_still_be_rejected():
    """SHELL_COMPANY_RISK is filtered out of the accreditation outcome, so its
    presence must not make REJECTED unreachable for entities."""
    case = _case("DENY", "FAIL", rule_id="ENTITY_ASSETS", subject="entity",
                 path="entity_assets", inputs={"entity_total_assets": 1_000_000,
                                               "threshold": 5_000_000})
    case.validation.append(RuleResult(
        rule_id="SHELL_COMPANY_RISK", citation="internal risk check — NOT a 501(a) test",
        outcome="PASS", inputs_used={}, reason="corroborated"))
    assert triage(case)[0] == "rejected"


def test_needs_documents_when_data_is_insufficient():
    assert triage(_case("INSUFFICIENT", "INSUFFICIENT_DATA"))[0] == "needs_documents"


def test_validator_pass_alone_cannot_auto_approve():
    assert triage(_case("DENY", "PASS"))[0] == "needs_review"


def test_guardrail_rejects_issuing_a_conflicted_case():
    case = _case("APPROVE", "FAIL", inputs={"income_year_2": 185000,
                                            "threshold": 200000})
    case.conflict = True
    case.decision = "auto_approved"          # the bug the guardrail exists to catch
    with pytest.raises(AssertionError):
        assert_issue_guardrail(case)


def test_guardrail_allows_a_clean_case():
    case = _case("APPROVE", "PASS")
    case.decision = "auto_approved"
    assert_issue_guardrail(case) is None
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pytest tests/test_triage.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.triage'`

- [ ] **Step 3: Write `app/triage.py`**

```python
from app.models import Case
from app.validator import RISK_ONLY_RULES
from app.tracing import span

CONFIDENCE_THRESHOLD = 0.85
NEAR_THRESHOLD_PCT = 0.05


def _accreditation_rules(case: Case):
    """Risk-only rules never decide approval or rejection."""
    return [r for r in case.validation if r.rule_id not in RISK_ONLY_RULES]


def detect_conflict(case: Case) -> bool:
    """True when the agents and the validator disagree. Neither layer wins —
    disagreement always routes to a human."""
    if case.recommendation is None:
        return False
    rules = _accreditation_rules(case)
    passed = any(r.outcome == "PASS" for r in rules)
    failed = any(r.outcome == "FAIL" for r in rules)
    if case.recommendation.decision == "APPROVE" and failed and not passed:
        return True
    if case.recommendation.decision == "DENY" and passed:
        return True
    return False


def _near_threshold(case: Case) -> str | None:
    for r in _accreditation_rules(case):
        threshold = r.inputs_used.get("threshold")
        if not isinstance(threshold, (int, float)) or threshold == 0:
            continue
        for name, value in r.inputs_used.items():
            if name == "threshold" or not isinstance(value, (int, float)):
                continue
            if threshold < value <= threshold * (1 + NEAR_THRESHOLD_PCT):
                return (f"{name} of {value:,.0f} is within "
                        f"{int(NEAR_THRESHOLD_PCT * 100)}% of the "
                        f"{threshold:,.0f} threshold")
    return None


def _low_confidence(case: Case) -> str | None:
    low = [n for n, f in case.extracted.items() if f.confidence < CONFIDENCE_THRESHOLD]
    return (f"extraction confidence below {CONFIDENCE_THRESHOLD} for: "
            f"{', '.join(low)}") if low else None


def triage(case: Case) -> tuple[str, str]:
    rec = case.recommendation
    rules = _accreditation_rules(case)
    passed = any(r.outcome == "PASS" for r in rules)
    all_insufficient = (all(r.outcome == "INSUFFICIENT_DATA" for r in rules)
                        if rules else True)

    with span("stage:triage") as s:
        if detect_conflict(case):
            failing = next((r for r in rules if r.outcome == "FAIL"), None)
            reason = (f"CONFLICT: agents recommended {rec.decision} but the "
                      f"deterministic validator disagreed. "
                      f"{failing.reason if failing else ''}")
            s.set(decision="needs_review", conflict=True, reason=reason)
            return "needs_review", reason

        if all_insufficient:
            reason = "; ".join(r.reason for r in rules) or "no documents provided"
            s.set(decision="needs_documents", conflict=False)
            return "needs_documents", reason

        if rec is None or rec.decision != "APPROVE" or not passed:
            if rec is not None and rec.decision == "DENY" and not passed:
                s.set(decision="rejected", conflict=False)
                return "rejected", ("Both the agent review and the deterministic "
                                    "validator rejected the claim.")
            reason = ("Agent review did not recommend approval."
                      if rec is None or rec.decision != "APPROVE"
                      else "No statutory test passed.")
            s.set(decision="needs_review", conflict=False, reason=reason)
            return "needs_review", reason

        for check in (_low_confidence(case), _near_threshold(case)):
            if check:
                s.set(decision="needs_review", conflict=False, reason=check)
                return "needs_review", check

        if rec.open_disputes:
            reason = f"unresolved dispute(s) on: {', '.join(rec.open_disputes)}"
            s.set(decision="needs_review", conflict=False, reason=reason)
            return "needs_review", reason

        if any(r.outcome == "FAIL" and r.rule_id in RISK_ONLY_RULES
               for r in case.validation):
            reason = "entity corroboration raised a risk signal"
            s.set(decision="needs_review", conflict=False, reason=reason)
            return "needs_review", reason

        winner = next(r for r in rules if r.outcome == "PASS")
        reason = f"{winner.rule_id} satisfied under {winner.citation}. {winner.reason}"
        s.set(decision="auto_approved", conflict=False)
        return "auto_approved", reason


def assert_issue_guardrail(case: Case) -> None:
    """The compliance invariant, enforced in code and mirrored as a PRISM rule:
    no case may be issued a letter while the agents and the validator disagree,
    or without a passing statutory test above the confidence threshold."""
    if case.decision != "auto_approved":
        return
    assert not case.conflict, (
        f"guardrail: case {case.case_id} reached ISSUE with an unresolved "
        f"agent/validator conflict")
    rules = _accreditation_rules(case)
    assert any(r.outcome == "PASS" for r in rules), (
        f"guardrail: case {case.case_id} reached ISSUE with no passing statutory test")
    assert all(f.confidence >= CONFIDENCE_THRESHOLD for f in case.extracted.values()), (
        f"guardrail: case {case.case_id} reached ISSUE with a field below the "
        f"{CONFIDENCE_THRESHOLD} confidence threshold")
```

- [ ] **Step 4: Run tests until green**

Run: `pytest tests/test_triage.py -v` → 12 passed

- [ ] **Step 5: Mirror the guardrail into PRISM via MCP (the bonus track)**

Connect your editor to PRISM's MCP (Brief 2 of 2 → Generate management prompt), then add the same invariant as a PRISM rule: *no span named `stage:issue` may exist on a trace whose `stage:triage` span has `conflict=true`.* Then demonstrate it: run case 5 with `assert_issue_guardrail` removed from the pipeline (v1 violates), restore it (v2 does not), same inputs. That is the PRISM challenge's exact ask, satisfied by logic you already needed.

- [ ] **Step 6: Commit**

```bash
git add app/triage.py tests/test_triage.py
git commit -m "feat: triage routing, agent/validator conflict detection, issue guardrail"
```

---

## Task 10: Solari BrokerCheck adapter

**Time box: 30 min.** Shape depends on Task 5's spike.

**Files:**
- Create: `app/adapters/__init__.py`, `app/adapters/solari.py`, `fixtures/cache/license_check.json`

**Interfaces:**
- Produces: `check_license(full_name: str, crd: str | None) -> dict` with keys `licenses`, `active`, `source_url`, `screenshot_url`, `checked_at`, `cache_hit`

- [ ] **Step 1: Write the cache fixture first — this is the demo's safety net**

```json
{
  "default": {
    "licenses": ["Series 65"],
    "active": true,
    "source_url": "https://brokercheck.finra.org/individual/summary/REPLACE_WITH_REAL_CRD",
    "screenshot_url": "/static/brokercheck_capture.png",
    "checked_at": "2026-10-24T18:00:00Z",
    "cache_hit": true
  }
}
```
Key it by the **real** CRD/name chosen in Task 2 step 4, and keep `default` as the catch-all.

- [ ] **Step 2: Write `app/adapters/solari.py`**

```python
import json, os, pathlib
from app.tracing import span

CACHE = json.loads(pathlib.Path("fixtures/cache/license_check.json").read_text())
TIMEOUT_S = 45


def _cached(full_name: str) -> dict:
    key = full_name.lower().replace(" ", "_")
    return CACHE.get(key) or CACHE.get("default") or {
        "licenses": [], "active": False, "source_url": "",
        "screenshot_url": "", "checked_at": "", "cache_hit": True}


def check_license(full_name: str, crd: str | None = None) -> dict:
    """Drive a Solari cloud browser to FINRA BrokerCheck. Falls back to cache on any
    failure or timeout — a flaky browser must never break the demo."""
    with span("solari.brokercheck", target=full_name, crd=crd or "") as s:
        if os.getenv("DEMO_MODE", "cached") == "cached":
            out = _cached(full_name)
            s.set(cache_hit=True, license_found=bool(out["licenses"]))
            return out
        try:
            out = _live_lookup(full_name, crd)
            out["cache_hit"] = False
            s.set(cache_hit=False, license_found=bool(out["licenses"]))
            return out
        except Exception as e:
            s.set(cache_hit=True, error=str(e)[:200])
            return _cached(full_name)


def _live_lookup(full_name: str, crd: str | None) -> dict:
    """Fill in from the Solari docs using what Task 5 learned. Must: open a cloud
    browser, go to https://brokercheck.finra.org/, search crd or full_name, read the
    registration rows, capture a screenshot, and return the dict shape above with
    checked_at set to the UTC timestamp of the capture."""
    raise NotImplementedError("wire from Solari docs after the Task 5 spike")
```

- [ ] **Step 3: Wire `_live_lookup`, then verify the fallback actually works**

Run: `DEMO_MODE=live python -c "from app.adapters.solari import check_license; print(check_license('<real name>'))"`
Then deliberately break it: `DEMO_MODE=live SOLARI_API_KEY=bogus python -c "..."` — must return cached data, not raise. **Verifying the fallback matters more than the live path.**

- [ ] **Step 4: Commit**

```bash
git add app/adapters/ fixtures/cache/license_check.json
git commit -m "feat: Solari BrokerCheck adapter with verified cache fallback"
```

---

## Task 11: akta.pro entity corroboration adapter

**Time box: 25 min.** Entity cases only.

**Files:**
- Create: `app/adapters/akta.py`, `fixtures/cache/entity_corroboration.json`

**Interfaces:**
- Produces: `enrich_entity(name: str, domain: str | None) -> dict` with keys `resolved`, `headcount`, `funding_total`, `operating_business_signal`, `adverse_news`, `cache_hit`

- [ ] **Step 1: Write the cache fixture — two entries**

One healthy operating company, and one unresolvable shell (`"resolved": false`) keyed to case 3's entity name.

- [ ] **Step 2: Write `app/adapters/akta.py`**

```python
import json, os, pathlib, httpx
from app.tracing import span

BASE = "https://api.akta.pro"
CACHE = json.loads(pathlib.Path("fixtures/cache/entity_corroboration.json").read_text())


def _cached(name: str) -> dict:
    return CACHE.get(name.lower()) or {
        "resolved": False, "headcount": None, "funding_total": None,
        "operating_business_signal": False, "adverse_news": [], "cache_hit": True}


def enrich_entity(name: str, domain: str | None = None) -> dict:
    """Company/org-level corroboration ONLY. akta.pro holds no individual-level data,
    so this can never establish accredited status — it only flags shell risk."""
    with span("akta.company_enrich", company=name) as s:
        if os.getenv("DEMO_MODE", "cached") == "cached":
            out = _cached(name)
            s.set(cache_hit=True, resolved=out["resolved"])
            return out
        try:
            out = _live_enrich(name, domain)
            out["cache_hit"] = False
            s.set(cache_hit=False, resolved=out["resolved"],
                  adverse_news=len(out["adverse_news"]))
            return out
        except Exception as e:
            s.set(cache_hit=True, error=str(e)[:200])
            return _cached(name)


def _live_enrich(name: str, domain: str | None) -> dict:
    """Company Search -> Company Data -> News Signals. The endpoint NAMES are
    documented at docs.akta.pro; confirm the exact URL shapes there and correct the
    paths below if they differ."""
    headers = {"Authorization": f"Bearer {os.environ['AKTA_API_KEY']}"}
    with httpx.Client(timeout=20.0, headers=headers) as c:
        found = c.post(f"{BASE}/v1/companies/search",
                       json={"query": domain or name}).json()
        results = found.get("results") or found.get("data") or []
        if not results:
            return {"resolved": False, "headcount": None, "funding_total": None,
                    "operating_business_signal": False, "adverse_news": []}
        uuid = results[0].get("uuid") or results[0].get("id")
        data = c.get(f"{BASE}/v1/companies/{uuid}").json()
        news = c.get(f"{BASE}/v1/companies/{uuid}/news").json()

    headcount = data.get("headcount") or data.get("employee_count")
    adverse = [{"title": n.get("title", ""), "sentiment": n.get("sentiment", ""),
                "date": n.get("published_at", "")}
               for n in (news.get("articles") or news.get("data") or [])
               if str(n.get("sentiment", "")).lower() in ("negative", "very_negative")]
    return {"resolved": True, "headcount": headcount,
            "funding_total": data.get("funding_total"),
            "operating_business_signal": bool(headcount and headcount > 0),
            "adverse_news": adverse[:5]}
```

- [ ] **Step 3: Verify both modes**

Cached: `python -c "from app.adapters.akta import enrich_entity; print(enrich_entity('Acme Holdings LLC'))"`
Live: `DEMO_MODE=live ...` against a real company. If paths are wrong, fix from `docs.akta.pro` — **do not exceed the box**, the cache carries the demo.

- [ ] **Step 4: Commit**

```bash
git add app/adapters/akta.py fixtures/cache/entity_corroboration.json
git commit -m "feat: akta.pro entity corroboration with cache fallback"
```

---

## Task 12: Pipeline orchestration and SSE streaming

**Time box: 40 min.** Replaces Task 3's mock `/run`.

**Files:**
- Create: `app/pipeline.py`
- Modify: `app/main.py`

**Interfaces:**
- Produces: `run_pipeline(case: Case) -> Iterator[dict]` yielding `{"stage", "status", "detail"}`

- [ ] **Step 1: Write `app/pipeline.py`**

```python
import datetime
from typing import Iterator
from app import store
from app.models import Case, AuditEvent
from app.nicrron import classify_document
from app.debate import run_debate
from app.validator import validate
from app.triage import triage, detect_conflict, assert_issue_guardrail
from app.letter import draft_letter
from app.venue import get_venue
from app.adapters.solari import check_license
from app.adapters.akta import enrich_entity
from app.tracing import span, current_trace_url


def _audit(case: Case, stage: str, actor: str, summary: str) -> None:
    case.audit_trail.append(AuditEvent(
        ts=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        stage=stage, actor=actor, summary=summary,
        trace_id=current_trace_url() or ""))


def run_pipeline(case: Case) -> Iterator[dict]:
    venue = get_venue()
    thread = venue.open_thread(case.case_id)

    with span("case", case_id=case.case_id, claimed_path=case.claimed_path,
              subject_type=case.subject_type):
        # EXTRACT — classify every document, then ONE debate over all of them
        yield {"stage": "extract", "status": "running", "detail": "classifying documents"}
        with span("stage:extract", doc_count=len(case.documents)):
            for doc in case.documents:
                doc.doc_type = classify_document(doc)
            if case.documents:
                result = run_debate(case.documents)
                case.debate = result.turns
                case.extracted = result.fields
                case.recommendation = result.recommendation
                for turn in result.turns:
                    venue.post_turn(thread, turn.actor, turn.model, turn.model_dump())
                    _audit(case, "extract", turn.actor,
                           f"round {turn.round}: {len(turn.challenges)} challenges, "
                           f"{len(turn.resolutions)} resolutions")
        venue.save_version(case, "extract")
        store.save(case)
        yield {"stage": "extract", "status": "done",
               "detail": f"{len(case.extracted)} fields after debate"}

        # ENRICH — conditional external checks
        yield {"stage": "enrich", "status": "running", "detail": "external checks"}
        with span("stage:enrich"):
            if case.claimed_path == "license":
                case.evidence["license_check"] = check_license(
                    case.subject_name, case.crd_number)
                _audit(case, "enrich", "solari", "FINRA BrokerCheck lookup")
            if case.subject_type == "entity":
                case.evidence["entity_corroboration"] = enrich_entity(
                    case.subject_name, case.entity_domain)
                _audit(case, "enrich", "akta.pro", "entity corroboration")
        venue.save_version(case, "enrich")
        store.save(case)
        yield {"stage": "enrich", "status": "done", "detail": "evidence gathered"}

        # VALIDATE — deterministic
        yield {"stage": "validate", "status": "running", "detail": "Rule 501(a) checks"}
        with span("stage:validate"):
            case.validation = validate(case)
        venue.save_version(case, "validate")
        store.save(case)
        yield {"stage": "validate", "status": "done",
               "detail": "; ".join(f"{r.rule_id}={r.outcome}" for r in case.validation)}

        # TRIAGE
        yield {"stage": "triage", "status": "running", "detail": "routing"}
        case.conflict = detect_conflict(case)
        case.decision, case.decision_reason = triage(case)
        _audit(case, "triage", "system", f"{case.decision}: {case.decision_reason}")
        store.save(case)
        yield {"stage": "triage", "status": "done",
               "detail": f"{case.decision}"
                         f"{' (CONFLICT)' if case.conflict else ''}"}

        # ISSUE
        if case.decision == "auto_approved":
            assert_issue_guardrail(case)
            yield {"stage": "issue", "status": "running", "detail": "drafting letter"}
            with span("stage:issue"):
                case.letter_md = draft_letter(case)
            _audit(case, "issue", "system", "letter issued")
            yield {"stage": "issue", "status": "done", "detail": "letter ready"}

        case.trace_url = current_trace_url()
        venue.save_version(case, "final")
        store.save(case)
        yield {"stage": "complete", "status": "done", "detail": case.decision}
```

- [ ] **Step 2: Replace the mock endpoint in `app/main.py`**

```python
import json
from fastapi.responses import StreamingResponse
from app.pipeline import run_pipeline
from app.tracing import init_tracing

init_tracing()


@app.post("/cases/{case_id}/run")
def run_case(case_id: str):
    case = _require(case_id)

    def stream():
        for event in run_pipeline(case):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
```

- [ ] **Step 3: Run one case end to end**

Run: `curl -N -X POST localhost:8000/cases/<id>/run`
Expected: events in order `extract → enrich → validate → triage → [issue] → complete`.

- [ ] **Step 4: Commit**

```bash
git add app/pipeline.py app/main.py
git commit -m "feat: pipeline orchestration with SSE stage streaming"
```

---

## Task 13: Roundtable venue and letter generation

**Time box: 45 min.** First candidate for the cut ladder if you are behind.

**Files:**
- Create: `app/venue.py`, `app/letter.py`

**Interfaces:**
- Produces: `get_venue() -> DebateVenue`, `LocalJsonVenue`, `RoundtableVenue`, `draft_letter(case: Case) -> str`

- [ ] **Step 1: Write `app/venue.py`, local implementation first**

```python
import json, os, pathlib
from typing import Protocol
from app.models import Case
from app.tracing import span

OUT = pathlib.Path("fixtures/versions")
OUT.mkdir(parents=True, exist_ok=True)


class DebateVenue(Protocol):
    def open_thread(self, case_id: str) -> str: ...
    def post_turn(self, thread: str, actor: str, model: str, content: dict) -> None: ...
    def save_version(self, case: Case, stage: str) -> str: ...


class LocalJsonVenue:
    def open_thread(self, case_id: str) -> str:
        return f"local:{case_id}"

    def post_turn(self, thread: str, actor: str, model: str, content: dict) -> None:
        p = OUT / f"{thread.split(':')[-1]}_turns.jsonl"
        with p.open("a") as f:
            f.write(json.dumps({"actor": actor, "model": model,
                                "content": content}) + "\n")

    def save_version(self, case: Case, stage: str) -> str:
        p = OUT / f"{case.case_id}_{stage}.json"
        p.write_text(case.model_dump_json(indent=2))
        return str(p)


class RoundtableVenue:
    """The debate thread plus a versioned case file in a Roundtable workspace. Every
    method falls back to local on failure — Roundtable must never break the pipeline."""

    def __init__(self):
        from roundtable import Client  # adjust to the real SDK import
        self._c = Client(api_key=os.environ["ROUNDTABLE_API_KEY"])
        self._local = LocalJsonVenue()

    def open_thread(self, case_id: str) -> str:
        try:
            return self._c.threads.create(title=f"Verification {case_id}").id
        except Exception:
            return self._local.open_thread(case_id)

    def post_turn(self, thread: str, actor: str, model: str, content: dict) -> None:
        self._local.post_turn(thread, actor, model, content)
        if thread.startswith("local:"):
            return
        with span("roundtable.post_turn", actor=actor, model=model):
            try:
                self._c.messages.create(thread_id=thread,
                                        author=f"{actor} ({model})",
                                        body=json.dumps(content, indent=2)[:8000])
            except Exception:
                pass

    def save_version(self, case: Case, stage: str) -> str:
        local_path = self._local.save_version(case, stage)
        with span("roundtable.save_version", stage=stage):
            try:
                self._c.files.upsert(path=f"cases/{case.case_id}.json",
                                     content=case.model_dump_json(indent=2),
                                     message=f"stage: {stage}")
            except Exception:
                pass
        return local_path


def get_venue() -> DebateVenue:
    if os.getenv("ROUNDTABLE_API_KEY"):
        try:
            return RoundtableVenue()
        except Exception:
            pass
    return LocalJsonVenue()
```

- [ ] **Step 2: Write `app/letter.py`**

```python
from app.models import Case
from app.nicrron import complete_json, ADJUDICATOR_MODEL
from app.tracing import span

SYSTEM = (
    "You draft accreditation verification letters for a Rule 506(c) offering. Every "
    "figure, citation, and the determination itself are FIXED INPUTS — reproduce them "
    "exactly and never recompute, reinterpret, or soften them. Reply with JSON only."
)


def draft_letter(case: Case) -> str:
    passing = [r for r in case.validation if r.outcome == "PASS"]
    facts = {
        "subject_name": case.subject_name or "the investor",
        "subject_type": case.subject_type,
        "determination": "ACCREDITED",
        "basis": [{"rule_id": r.rule_id, "citation": r.citation, "reason": r.reason,
                   "inputs_used": r.inputs_used} for r in passing],
        "documents_reviewed": [d.filename for d in case.documents],
        "independent_review": {
            "extractor_and_challenger_agreed": not case.conflict,
            "trust_assessment": (case.recommendation.trust_assessment
                                 if case.recommendation else ""),
        },
        "external_sources": list(case.evidence.keys()),
    }
    with span("letter.draft", model=ADJUDICATOR_MODEL) as s:
        out = complete_json(
            ADJUDICATOR_MODEL, SYSTEM,
            "Write a short formal verification letter in Markdown from these fixed "
            'facts. Reply {"letter_md": "..."}.\nInclude: the determination, the '
            "statutory basis with its citation, which documents and external sources "
            "were reviewed, a note that two independent AI models from different "
            "vendors reviewed the documents and a deterministic validator "
            "independently confirmed the statutory thresholds, and that this "
            "verification is valid for 90 days. State that a documented process of "
            "this kind GENERALLY supports the issuer's reasonable-belief position — "
            "do not promise that it guarantees anything.\n\n"
            f"Facts: {facts}")
        letter = out.get("letter_md", "")
        s.set(letter_len=len(letter))
    return letter
```

- [ ] **Step 3: Verify**

Run: `python -c "from app.venue import get_venue; v=get_venue(); print(type(v).__name__, v.open_thread('case_x'))"`
Expected: `RoundtableVenue` with a real thread id, or `LocalJsonVenue` — **both acceptable**.

- [ ] **Step 4: Commit**

```bash
git add app/venue.py app/letter.py
git commit -m "feat: Roundtable debate venue and letter generation"
```

---

## Task 14: Seed, cache, and rehearse

**Time box: 40 min.** Do not skip. An unrehearsed demo is a failed demo.

**Files:**
- Create: `scripts/seed_demo.py`

- [ ] **Step 1: Write `scripts/seed_demo.py`**

Loads each fixture in `fixtures/cases/`, POSTs the case with its attestations, uploads its documents, runs the pipeline, and prints a table of `case_id | claimed_path | decision | conflict`.

- [ ] **Step 2: Run it and check every decision against the expected table**

Run: `python scripts/seed_demo.py`

| Case | Expected decision | Expected conflict |
|---|---|---|
| 1 clean income | `auto_approved` | false |
| 2 license | `auto_approved` | false |
| 3 entity shell | `needs_review` | false |
| 4 arithmetic forgery | `needs_review` | false |
| 5 temporal conflict | `needs_review` | **true** |

**Case 5 must show `conflict: true`.** If the agents correctly catch the 2024 shortfall, the conflict will not fire — widen the gap between what averaging suggests and what "each year" requires (raise 2025, lower 2024) until the adjudicator approves. **That beat is the demo's centerpiece; budget iterations for it.**

- [ ] **Step 3: Snapshot each completed run as a replay cache**

Copy each finished case JSON from `fixtures/live_cases/` into `fixtures/cases/replay/`. If the live debate exceeded ~25s in Task 7 step 5, the demo plays from these and you do **one** short live run as the honesty beat.

- [ ] **Step 4: Run the WiFi-down drill**

Disconnect WiFi, set `DEMO_MODE=cached`, re-run `scripts/seed_demo.py`. Every case must still complete. **Any crash here is a P0** — fix it before anything else.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed_demo.py fixtures/
git commit -m "feat: demo seeding, replay cache, offline drill"
```

---

## Task 15 (DEFERRED — only if the demo is already safe): deterministic parser cross-check

Per the user's direction this comes **last**. It is the second backend engineer's parser, slotted in as an independent second extraction. Do not let it onto the critical path.

**Files:** Modify `app/validator.py`, `tests/test_validator.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_validator.py (append)
from app.validator import cross_check_extraction
from app.models import Field


def test_cross_check_flags_disagreement():
    agent = {"income_year_1": Field(value=240000, confidence=0.95)}
    conflict, notes = cross_check_extraction(agent, {"income_year_1": 198000})
    assert conflict is True
    assert agent["income_year_1"].disputed is True
    assert "income_year_1" in notes[0]


def test_cross_check_raises_confidence_on_agreement():
    agent = {"income_year_1": Field(value=240000, confidence=0.80)}
    conflict, _ = cross_check_extraction(agent, {"income_year_1": 240000})
    assert conflict is False
    assert agent["income_year_1"].confidence > 0.80
```

- [ ] **Step 2: Run it, watch it fail, then implement**

```python
def cross_check_extraction(agent_fields: dict, deterministic: dict
                           ) -> tuple[bool, list[str]]:
    """Two independent extractions corroborating each other. Agreement raises
    confidence; disagreement disputes the field and forces human review."""
    notes, conflict = [], False
    for name, det_value in deterministic.items():
        f = agent_fields.get(name)
        if f is None:
            continue
        try:
            same = abs(float(f.value) - float(det_value)) < 0.01
        except (TypeError, ValueError):
            same = str(f.value).strip() == str(det_value).strip()
        if same:
            f.confidence = min(1.0, f.confidence + 0.10)
        else:
            conflict = True
            f.disputed = True
            notes.append(f"{name}: agents read {f.value}, parser read {det_value}")
    return conflict, notes
```

- [ ] **Step 3: Run tests and commit**

```bash
pytest tests/test_validator.py -v
git add app/validator.py tests/test_validator.py
git commit -m "feat: deterministic parser cross-check as an independent second extraction"
```

---

## Cut Ladder

Apoorv's own tasks sum to **~7.5 hours** (455 min) against a ~6 hour clock — Task 2 is delegated and runs in parallel, so it does not count. The overrun is real, so cuts are planned rather than improvised. Cut from the top when you fall behind; every line below keeps all five sponsors integrated:

| Cut | Saves | What is lost |
|---|---|---|
| 1. Roundtable → `LocalJsonVenue` only | 30 min | The workspace view. The debate still runs and is logged; Roundtable stays integrated via a single real `open_thread` call. |
| 2. akta.pro → cached only, skip `_live_enrich` | 20 min | Nothing visible. The call shape is real, the response is pre-fetched. |
| 3. Letter → Jinja-style template instead of a model call | 20 min | Prose polish. Facts are identical since they were always fixed inputs. |
| 4. SSE → frontend polls `GET /cases/{id}` | 20 min | The live turn-by-turn reveal. Decide this **with** the frontend engineer, never unilaterally. |
| 5. Drop demo case 4 (forgery) | 15 min | A memorable beat. Cut case 4 before case 5 — case 5 is the architecture's proof. |

**Never cut:** Task 1 (modality), Task 2 (fixtures), Task 8/9 (validator + triage — demo case 5 lives there), Task 14 step 4 (the WiFi drill).

---

## Self-Review Notes

**Spec coverage:** §4 architecture → Tasks 3, 12. §5.1 Nicrron debate → Tasks 6, 7. §5.2 Roundtable → Task 13. §5.3 PRISM → Task 4, guardrail in Task 9, spans throughout. §5.4 akta.pro → Task 11. §5.5 Solari → Tasks 5, 10. §6 validator → Task 8. §7 triage → Task 9. §8 API contract → Task 3. §9 demo cases → Tasks 2, 14. §10 risk fallbacks → every adapter, plus the Cut Ladder. §12 open questions → Tasks 1 and 5 resolve two; the organizer ruling is in Provisioning Order step 6.

**Spec changes this plan supersedes:** demo case 5 is now a temporal conflict ($240K/$185K), not `$199,400`; the debate runs once per case, not per document; documents are assumed text-only until Task 1 proves otherwise; `signs_of_alteration` is conditional on vision; intake collects three written attestations; the customer is 506(c) issuers rather than small VC funds. **Update the spec to match** so the two documents do not diverge.

**Known gaps, deliberate:** the GP dashboard UI is the frontend engineer's work against Task 3's contract. Letter PDF rendering is out — Markdown only. `fixtures/live_cases/` is a flat-file store, correct for a one-session demo and wrong for anything else.
