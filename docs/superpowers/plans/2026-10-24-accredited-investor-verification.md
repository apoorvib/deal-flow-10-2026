# Accredited Investor Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a demoable verification service where two AI agents from different vendors adversarially review an investor's documents, a deterministic validator confirms the Rule 501(a) arithmetic, and every step is traced into an audit trail.

**Architecture:** A linear pipeline of stage functions over one `Case` object. Document understanding is a 4-round LLM debate (extract → challenge → respond → adjudicate) run across two vendors via the Nicrron gateway, hosted in a Roundtable thread. A deterministic validator independently checks the statutory thresholds; disagreement between the agents' recommendation and the validator forces human review. PRISM traces the whole tree.

**Tech Stack:** Python 3.11, FastAPI + uvicorn, pydantic v2, `openai` SDK pointed at Nicrron, `prismtrace-sdk` (or OTel exporter), `httpx`, pytest.

**Spec:** [`docs/superpowers/specs/2026-10-24-accredited-investor-verification-design.md`](../specs/2026-10-24-accredited-investor-verification-design.md)

## Global Constraints

- **Judging is tonight.** ~6 hours. Every task has a time box; when it expires, take the fallback in spec §10 and move on.
- **All five sponsor tools must be integrated** (organizer rule): Nicrron, Roundtable, PRISM deep; akta.pro, Solari thin.
- **Cost is a non-constraint.** `openai/gpt-6-luna` = $0.10/1M prompt tokens. Optimize for judgment quality, not call count.
- **Model IDs, exact:** extractor `openai/gpt-6-luna`, challenger `anthropic/claude-sonnet-5`, adjudicator `openai/gpt-6-astra`, classifier `openai/gpt-6-luna`. Challenger MUST NOT be an OpenAI model — cross-vendor independence is the whole point.
- **Nicrron base URL, exact:** `https://api.nicrron.ai/v1`
- **The model never decides alone.** `decision == "auto_approved"` requires the adjudicator's recommendation AND the validator to agree.
- **Confidence threshold:** `0.85`. **Near-threshold band:** `0.05` (5%).
- **Test strategy, deliberate:** full TDD on `validator.py` and `triage.py` — they are pure functions and demo case 5 depends on their exact behavior. Integration tasks (Roundtable, Solari, akta, PRISM) get a smoke check instead of unit tests; you cannot meaningfully unit-test an SDK you have never run.
- **Every external call is cached.** The full demo must run with WiFi unplugged.
- **Never use real investor data.** Fixtures are synthetic and visibly watermarked.
- **Env vars:** `NICRRON_API_KEY`, `PRISMTRACE_API_KEY`, `ROUNDTABLE_API_KEY`, `AKTA_API_KEY`, `SOLARI_API_KEY`, `DEMO_MODE` (`live` | `cached`).

---

## File Structure

| File | Responsibility |
|---|---|
| `app/models.py` | All pydantic models. No logic. |
| `app/main.py` | FastAPI routes + SSE streaming. |
| `app/pipeline.py` | Stage orchestration; yields stage events. |
| `app/nicrron.py` | Nicrron client, model constants, JSON-mode helper, doc classification. |
| `app/debate.py` | The 4-round adversarial debate. |
| `app/validator.py` | Deterministic Rule 501(a) checks. **TDD.** |
| `app/triage.py` | Decision routing + conflict detection. **TDD.** |
| `app/venue.py` | `DebateVenue` protocol, `LocalJsonVenue`, `RoundtableVenue`. |
| `app/tracing.py` | PRISM init + span helper. |
| `app/letter.py` | Accreditation letter generation. |
| `app/adapters/solari.py` | BrokerCheck lookup + cache. |
| `app/adapters/akta.py` | Company enrichment + cache. |
| `fixtures/cases/` | The 5 demo cases. |
| `fixtures/cache/` | Cached external responses. |
| `tests/` | `test_validator.py`, `test_triage.py`, `test_debate.py` |

---

## Task 1: Skeleton, models, and mocked API contract

**Time box: 30 min.** Highest priority — unblocks the frontend engineer permanently.

**Files:**
- Create: `app/models.py`, `app/main.py`, `requirements.txt`, `.env.example`
- Create: `fixtures/cases/mock_case.json`

**Interfaces:**
- Consumes: nothing
- Produces: every model below, plus routes `POST /cases`, `POST /cases/{id}/documents`, `POST /cases/{id}/run`, `GET /cases/{id}`, `GET /cases`, `GET /cases/{id}/letter`

- [ ] **Step 1: Write `requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
pydantic==2.9.2
openai==1.54.0
httpx==0.27.2
python-multipart==0.0.12
pytest==8.3.3
pytest-asyncio==0.24.0
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
```

- [ ] **Step 3: Write `app/main.py` returning the mock fixture**

```python
import json, uuid, pathlib
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.models import Case, CreateCaseRequest, Document

app = FastAPI(title="Accredited Investor Verification")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

CASES: dict[str, Case] = {}
MOCK = json.loads(pathlib.Path("fixtures/cases/mock_case.json").read_text())


@app.post("/cases")
def create_case(req: CreateCaseRequest):
    case_id = f"case_{uuid.uuid4().hex[:8]}"
    CASES[case_id] = Case(case_id=case_id, **req.model_dump())
    return {"case_id": case_id}


@app.post("/cases/{case_id}/documents")
async def upload_document(case_id: str, file: UploadFile = File(...)):
    case = CASES.get(case_id)
    if not case:
        raise HTTPException(404, "case not found")
    doc = Document(doc_id=f"doc_{uuid.uuid4().hex[:6]}", filename=file.filename)
    case.documents.append(doc)
    return {"doc_id": doc.doc_id, "doc_type": doc.doc_type}


@app.get("/cases/{case_id}")
def get_case(case_id: str):
    case = CASES.get(case_id)
    if not case:
        raise HTTPException(404, "case not found")
    return case


@app.get("/cases")
def list_cases():
    return [
        {"case_id": c.case_id, "subject_name": c.subject_name,
         "claimed_path": c.claimed_path, "decision": c.decision}
        for c in CASES.values()
    ]


@app.get("/cases/{case_id}/letter")
def get_letter(case_id: str):
    case = CASES.get(case_id)
    if not case:
        raise HTTPException(404, "case not found")
    return {"letter_md": case.letter_md, "trace_url": case.trace_url}


@app.post("/cases/{case_id}/run")
def run_mock(case_id: str):
    """Replaced by the real SSE pipeline in Task 11. Returns the mock shape now
    so the frontend can build against a realistic payload immediately."""
    return MOCK
```

- [ ] **Step 4: Write `fixtures/cases/mock_case.json`**

A complete `Case` payload with two debate turns, one challenge, one `RuleResult`, and `decision: "auto_approved"`. It only has to be shape-accurate — the frontend reads keys, not values.

- [ ] **Step 5: Run the server and verify the contract**

Run: `uvicorn app.main:app --reload --port 8000`
Then: `curl -s -X POST localhost:8000/cases -H 'Content-Type: application/json' -d '{"subject_type":"individual","claimed_path":"income","subject_name":"Jane Doe"}'`
Expected: `{"case_id":"case_xxxxxxxx"}`

- [ ] **Step 6: Commit and tell the frontend engineer the contract is frozen**

```bash
git add requirements.txt .env.example app/ fixtures/
git commit -m "feat: API contract, domain models, mocked run endpoint"
```

---

## Task 2: PRISM tracing (wire before anything else exists)

**Time box: 25 min.** Retrofitting tracing is miserable — do it while there are only two files.

**Files:**
- Create: `app/tracing.py`
- Modify: `app/main.py` (call `init_tracing()` at import)

**Interfaces:**
- Produces: `init_tracing() -> None`, `span(name: str, **attrs)` context manager yielding an object with `.set(**attrs)`, `current_trace_url() -> str | None`

- [ ] **Step 1: Install and read the key**

Run: `pip install prismtrace-sdk`
If that package does not resolve within 5 minutes, fall back to OTel: `pip install opentelemetry-sdk opentelemetry-exporter-otlp` and point the OTLP exporter at PRISM per `blockconvey.com/docs`.

- [ ] **Step 2: Write `app/tracing.py` with a no-op fallback**

```python
import os, contextlib, logging

log = logging.getLogger("audit")
_ENABLED = False
_tracer = None


def init_tracing() -> None:
    """Never let tracing failure break the pipeline — tracing is passive."""
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

- [ ] **Step 3: Smoke check that a span reaches PRISM**

```python
# scratch_trace.py
from app.tracing import init_tracing, span
init_tracing()
with span("smoke.test", case_id="case_demo", stage="smoke") as s:
    s.set(result="ok")
print("sent")
```
Run: `python scratch_trace.py`, then confirm the span appears in the PRISM dashboard. If it does not appear within the time box, keep the local-logging path and move on — `tracing.py`'s interface does not change either way.

- [ ] **Step 4: Commit**

```bash
git add app/tracing.py app/main.py && git commit -m "feat: PRISM tracing with local-logging fallback"
```

---

## Task 3: SPIKE — does `gpt-6-luna` accept images? (10 min, decision only)

Not a feature task. Output is a **decision**, not code you keep.

- [ ] **Step 1: Send one image to luna**

```python
# scratch_vision.py
import base64, os
from openai import OpenAI
c = OpenAI(base_url="https://api.nicrron.ai/v1", api_key=os.environ["NICRRON_API_KEY"])
b64 = base64.b64encode(open("fixtures/sample_w2.png", "rb").read()).decode()
r = c.chat.completions.create(
    model="openai/gpt-6-luna",
    messages=[{"role": "user", "content": [
        {"type": "text", "text": "What dollar amount appears in box 1?"},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
    ]}],
)
print(r.choices[0].message.content)
```

- [ ] **Step 2: Record the decision in the spec's §12 Open Questions**

- Reads the image → extractor stays `openai/gpt-6-luna`
- Rejects images → set `EXTRACTOR_MODEL = "anthropic/claude-sonnet-5"` and move the challenger to a third vendor (`deepseek/deepseek-v4-flash`), preserving cross-vendor independence
- Both fail → documents arrive as pasted **text** only; drop image upload from the demo

---

## Task 4: SPIKE — can Solari load BrokerCheck? (15 min, decision only)

Do this early. It is the flakiest integration, and discovering it is unusable at hour five is fatal.

- [ ] **Step 1: Read the Solari docs**

Docs PDF is linked in `resources.md`. Redeem code `VC-HACK1MO-DNNXSYYM` first.

- [ ] **Step 2: Drive one cloud browser to BrokerCheck**

Navigate to `https://brokercheck.finra.org/`, search a known-real individual CRD, screenshot, return the page text. Time the whole round trip.

- [ ] **Step 3: Record the decision**

- Works under ~30s → wire live in Task 9 with a cache fallback
- Works but slow/flaky → cache-first; live call only as a background refresh
- Cannot reach it at all → pre-record a screen capture of the browser session and serve a cached `license_check`. Solari is still integrated (the call is real, just made ahead of time); say so honestly on stage.

---

## Task 5: Nicrron client and document classification

**Time box: 30 min.**

**Files:**
- Create: `app/nicrron.py`
- Create: `tests/test_nicrron.py`

**Interfaces:**
- Consumes: `app.models.Document`
- Produces: `EXTRACTOR_MODEL`, `CHALLENGER_MODEL`, `ADJUDICATOR_MODEL`, `CLASSIFIER_MODEL`, `complete_json(model, system, user, image_b64=None) -> dict`, `classify_document(doc: Document) -> str`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_nicrron.py
import pytest
from app.nicrron import _coerce_json

def test_coerce_json_strips_markdown_fence():
    raw = '```json\n{"doc_type": "w2"}\n```'
    assert _coerce_json(raw) == {"doc_type": "w2"}

def test_coerce_json_raises_on_garbage():
    with pytest.raises(ValueError):
        _coerce_json("I cannot help with that.")
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
CHALLENGER_MODEL = "anthropic/claude-sonnet-5"   # MUST be non-OpenAI
ADJUDICATOR_MODEL = "openai/gpt-6-astra"
CLASSIFIER_MODEL = "openai/gpt-6-luna"

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _coerce_json(raw: str) -> dict:
    cleaned = _FENCE.sub("", raw).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start != -1 and end > start:
            return json.loads(cleaned[start:end + 1])
        raise ValueError(f"model did not return JSON: {raw[:200]}") from e


def client() -> OpenAI:
    return OpenAI(base_url=BASE_URL, api_key=os.environ["NICRRON_API_KEY"])


def complete_json(model: str, system: str, user: str, image_b64: str | None = None) -> dict:
    content: list | str
    if image_b64:
        content = [
            {"type": "text", "text": user},
            {"type": "image_url",
             "image_url": {"url": f"data:image/png;base64,{image_b64}"}},
        ]
    else:
        content = user
    with span("nicrron.call", model=model, has_image=bool(image_b64)) as s:
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

Run: `pytest tests/test_nicrron.py -v`
Expected: 2 passed

- [ ] **Step 5: Smoke-check a real call**

Run: `python -c "from app.nicrron import complete_json, CLASSIFIER_MODEL; print(complete_json(CLASSIFIER_MODEL,'Reply JSON only.','Reply {\"ok\": true}'))"`
Expected: `{'ok': True}`. A 401 means the key is unset; a 402 means credits were never redeemed.

- [ ] **Step 6: Commit**

```bash
git add app/nicrron.py tests/test_nicrron.py
git commit -m "feat: Nicrron client, JSON coercion, document classification"
```

---

## Task 6: The adversarial debate loop

**Time box: 95 min.** The centerpiece. Build it with plain function calls — Roundtable gets layered on in Task 10.

**Files:**
- Create: `app/debate.py`
- Create: `tests/test_debate.py`

**Interfaces:**
- Consumes: `app.models.{Document, Field, Challenge, Resolution, DebateTurn, AgentRecommendation}`, `app.nicrron.{complete_json, EXTRACTOR_MODEL, CHALLENGER_MODEL, ADJUDICATOR_MODEL}`
- Produces: `FAILURE_MODES: list[str]`, `run_debate(doc: Document) -> DebateResult` where `DebateResult` has `.turns: list[DebateTurn]`, `.fields: dict[str, Field]`, `.recommendation: AgentRecommendation`

- [ ] **Step 1: Write the failing orchestration test**

Tests the *loop*, not the models — the LLM calls are stubbed. This is the only part of the debate that can be deterministically tested.

```python
# tests/test_debate.py
from unittest.mock import patch
from app.models import Document
from app import debate

DOC = Document(doc_id="d1", filename="w2.pdf", doc_type="w2", text="Wages: $214,500")

R1 = {"fields": {"wages_2025": {"value": 214500, "confidence": 0.95,
                               "source_quote": "Wages: $214,500"}}}
R2 = {"challenges": [{"field_name": "wages_2025", "failure_mode": "wrong_field",
                     "reason": "Box 1 wages are not total income"}]}
R3 = {"resolutions": [{"field_name": "wages_2025", "action": "DEFEND",
                      "revised_value": None, "justification": "Document states wages only"}]}
R4 = {"fields": {"wages_2025": {"value": 214500, "confidence": 0.93,
                                "source_quote": "Wages: $214,500"}},
      "recommendation": {"decision": "APPROVE", "trust_assessment": "consistent",
                         "reasoning": "Wages exceed threshold", "open_disputes": []}}


def test_run_debate_produces_four_turns_in_order():
    with patch.object(debate, "complete_json", side_effect=[R1, R2, R3, R4]):
        result = debate.run_debate(DOC)
    assert [t.round for t in result.turns] == [1, 2, 3, 4]
    assert [t.actor for t in result.turns] == [
        "extractor", "challenger", "adjudicator", "adjudicator"]


def test_challenged_field_is_marked_disputed():
    with patch.object(debate, "complete_json", side_effect=[R1, R2, R3, R4]):
        result = debate.run_debate(DOC)
    assert result.fields["wages_2025"].disputed is True


def test_conceded_value_replaces_original():
    r3_concede = {"resolutions": [{"field_name": "wages_2025", "action": "CONCEDE",
                                   "revised_value": 198000,
                                   "justification": "Misread the digit"}]}
    r4_concede = {"fields": {"wages_2025": {"value": 198000, "confidence": 0.9,
                                            "source_quote": "Wages: $198,000"}},
                  "recommendation": {"decision": "DENY", "trust_assessment": "revised",
                                     "reasoning": "Below threshold", "open_disputes": []}}
    with patch.object(debate, "complete_json",
                      side_effect=[R1, R2, r3_concede, r4_concede]):
        result = debate.run_debate(DOC)
    assert result.fields["wages_2025"].value == 198000
    assert result.recommendation.decision == "DENY"


def test_challenger_is_not_an_openai_model():
    from app.nicrron import CHALLENGER_MODEL, EXTRACTOR_MODEL
    assert not CHALLENGER_MODEL.startswith("openai/")
    assert EXTRACTOR_MODEL.split("/")[0] != CHALLENGER_MODEL.split("/")[0]
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pytest tests/test_debate.py -v`
Expected: FAIL — `AttributeError: module 'app.debate' has no attribute 'run_debate'`

- [ ] **Step 3: Write `app/debate.py`**

```python
from dataclasses import dataclass, field as dc_field
from app.models import (Document, Field, Challenge, Resolution,
                        DebateTurn, AgentRecommendation)
from app.nicrron import (complete_json, EXTRACTOR_MODEL,
                         CHALLENGER_MODEL, ADJUDICATOR_MODEL)
from app.tracing import span

FAILURE_MODES = [
    "misread_or_transposed_digits",
    "wrong_field",                  # AGI vs total income vs wages
    "stale_or_wrong_tax_year",
    "cross_document_inconsistency",
    "face_arithmetic_error",        # totals that do not add up
    "signs_of_alteration",          # font/alignment mismatch, impossible values
    "unsupported_inference",        # a field the document never states
]

TARGET_FIELDS = {
    "w2": ["wages", "tax_year", "employer_name"],
    "1040": ["total_income", "adjusted_gross_income", "tax_year", "filing_status"],
    "bank_statement": ["institution", "ending_balance", "statement_date"],
    "brokerage_statement": ["institution", "ending_balance", "statement_date"],
    "cpa_letter": ["attestation_type", "signer_name", "license_number", "letter_date"],
    "trust_deed": ["entity_name", "trustee_name", "formation_date"],
    "unknown": ["any_monetary_amount", "any_date"],
}


@dataclass
class DebateResult:
    turns: list[DebateTurn] = dc_field(default_factory=list)
    fields: dict[str, Field] = dc_field(default_factory=dict)
    recommendation: AgentRecommendation | None = None


def _parse_fields(raw: dict, doc_id: str) -> dict[str, Field]:
    out = {}
    for name, f in (raw.get("fields") or {}).items():
        if not isinstance(f, dict):
            continue
        out[name] = Field(
            value=f.get("value"),
            confidence=float(f.get("confidence", 0.0)),
            source_quote=str(f.get("source_quote", "")),
            doc_id=doc_id,
        )
    return out


def _doc_payload(doc: Document) -> str:
    return (f"Document type: {doc.doc_type}\nFilename: {doc.filename}\n\n"
            f"{(doc.text or '(image attached)')[:6000]}")


def round1_extract(doc: Document) -> tuple[dict[str, Field], dict]:
    wanted = TARGET_FIELDS.get(doc.doc_type, TARGET_FIELDS["unknown"])
    raw = complete_json(
        EXTRACTOR_MODEL,
        "You extract financial facts from documents. Reply with JSON only. "
        "Never guess: if the document does not state a value, omit the field.",
        f"Extract these fields if present: {wanted}.\n"
        'Reply {"fields": {"<name>": {"value": <number|string>, '
        '"confidence": <0.0-1.0>, "source_quote": "<exact text you read it from>"}}}.\n'
        "confidence reflects how certain you are you read the correct value "
        "from the correct field.\n\n" + _doc_payload(doc),
        image_b64=doc.image_b64,
    )
    return _parse_fields(raw, doc.doc_id), raw


def round2_challenge(doc: Document, fields: dict[str, Field]) -> list[Challenge]:
    summary = {k: {"value": v.value, "confidence": v.confidence,
                   "source_quote": v.source_quote} for k, v in fields.items()}
    raw = complete_json(
        CHALLENGER_MODEL,
        "You are an adversarial reviewer auditing another model's extraction of a "
        "financial document for an SEC accredited-investor determination. Your job is "
        "to find errors, not to agree. Reply with JSON only.",
        f"Another model extracted these fields: {summary}\n\n"
        f"Check specifically for these failure modes: {FAILURE_MODES}\n\n"
        "Raise a challenge ONLY where you have a specific, stateable reason tied to "
        "the document text. Do not raise vague doubts. If the extraction is sound, "
        'return an empty list.\nReply {"challenges": [{"field_name": "...", '
        '"failure_mode": "<one of the list>", "reason": "<specific>"}]}.\n\n'
        + _doc_payload(doc),
        image_b64=doc.image_b64,
    )
    return [Challenge(**c) for c in (raw.get("challenges") or [])
            if isinstance(c, dict) and c.get("field_name")]


def round3_respond(doc: Document, fields: dict[str, Field],
                   challenges: list[Challenge]) -> list[Resolution]:
    if not challenges:
        return []
    raw = complete_json(
        EXTRACTOR_MODEL,
        "You are defending your extraction against an auditor. Concede when the "
        "auditor is right. Reply with JSON only.",
        f"Your extraction: { {k: v.value for k, v in fields.items()} }\n"
        f"Challenges: {[c.model_dump() for c in challenges]}\n\n"
        'For each challenge reply {"resolutions": [{"field_name": "...", '
        '"action": "CONCEDE" or "DEFEND", "revised_value": <value|null>, '
        '"justification": "..."}]}. CONCEDE requires a revised_value.\n\n'
        + _doc_payload(doc),
        image_b64=doc.image_b64,
    )
    out = []
    for r in (raw.get("resolutions") or []):
        if isinstance(r, dict) and r.get("action") in ("CONCEDE", "DEFEND"):
            out.append(Resolution(
                field_name=r.get("field_name", ""),
                action=r["action"],
                revised_value=r.get("revised_value"),
                justification=str(r.get("justification", "")),
            ))
    return out


def round4_adjudicate(doc: Document, fields: dict[str, Field],
                      challenges: list[Challenge],
                      resolutions: list[Resolution]
                      ) -> tuple[dict[str, Field], AgentRecommendation]:
    raw = complete_json(
        ADJUDICATOR_MODEL,
        "You adjudicate a dispute between an extractor and an auditor over a financial "
        "document, for an SEC accredited-investor determination. Reply with JSON only. "
        "You decide the final field values and whether the document is trustworthy. "
        "You do NOT apply dollar thresholds — a separate deterministic validator does that.",
        f"Extraction: { {k: v.model_dump() for k, v in fields.items()} }\n"
        f"Challenges: {[c.model_dump() for c in challenges]}\n"
        f"Responses: {[r.model_dump() for r in resolutions]}\n\n"
        'Reply {"fields": {...same shape as extraction...}, "recommendation": '
        '{"decision": "APPROVE"|"DENY"|"INSUFFICIENT", "trust_assessment": "...", '
        '"reasoning": "...", "open_disputes": ["field_name", ...]}}.\n'
        "APPROVE means the documents credibly support the claim. List any challenge "
        "you could not resolve in open_disputes.\n\n" + _doc_payload(doc),
        image_b64=doc.image_b64,
    )
    final = _parse_fields(raw, doc.doc_id) or fields
    rec_raw = raw.get("recommendation") or {}
    rec = AgentRecommendation(
        decision=rec_raw.get("decision", "INSUFFICIENT"),
        trust_assessment=str(rec_raw.get("trust_assessment", "")),
        reasoning=str(rec_raw.get("reasoning", "")),
        open_disputes=[str(d) for d in (rec_raw.get("open_disputes") or [])],
    )
    if rec.decision not in ("APPROVE", "DENY", "INSUFFICIENT"):
        rec.decision = "INSUFFICIENT"
    return final, rec


def run_debate(doc: Document) -> DebateResult:
    res = DebateResult()

    with span("debate.round1.extract", doc_id=doc.doc_id) as s:
        fields, _ = round1_extract(doc)
        s.set(field_count=len(fields),
              min_confidence=min([f.confidence for f in fields.values()], default=0.0))
    res.turns.append(DebateTurn(round=1, actor="extractor",
                                model=EXTRACTOR_MODEL, fields=fields))

    with span("debate.round2.challenge", doc_id=doc.doc_id) as s:
        challenges = round2_challenge(doc, fields)
        s.set(challenge_count=len(challenges),
              fields_challenged=[c.field_name for c in challenges])
    res.turns.append(DebateTurn(round=2, actor="challenger",
                                model=CHALLENGER_MODEL, challenges=challenges))

    with span("debate.round3.respond", doc_id=doc.doc_id) as s:
        resolutions = round3_respond(doc, fields, challenges)
        s.set(conceded=sum(r.action == "CONCEDE" for r in resolutions),
              defended=sum(r.action == "DEFEND" for r in resolutions))
    res.turns.append(DebateTurn(round=3, actor="adjudicator",
                                model=EXTRACTOR_MODEL, resolutions=resolutions))

    for r in resolutions:
        if r.action == "CONCEDE" and r.field_name in fields and r.revised_value is not None:
            fields[r.field_name].value = r.revised_value

    with span("debate.round4.adjudicate", doc_id=doc.doc_id) as s:
        final, rec = round4_adjudicate(doc, fields, challenges, resolutions)
        s.set(recommendation=rec.decision, disputes_open=len(rec.open_disputes))
    res.turns.append(DebateTurn(round=4, actor="adjudicator",
                                model=ADJUDICATOR_MODEL, fields=final))

    challenged = {c.field_name for c in challenges}
    for name, f in final.items():
        if name in challenged:
            f.disputed = True

    res.fields = final
    res.recommendation = rec
    return res
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/test_debate.py -v`
Expected: 4 passed

- [ ] **Step 5: Run one real debate end to end**

```bash
python -c "
from app.models import Document
from app.debate import run_debate
d = Document(doc_id='d1', filename='w2.txt', doc_type='w2',
             text='Form W-2 2025. Employer: Acme Corp. Box 1 Wages: \$214,500.00')
r = run_debate(d)
print('turns', len(r.turns)); print('fields', {k: v.value for k,v in r.fields.items()})
print('rec', r.recommendation.decision, '|', r.recommendation.reasoning[:120])
"
```
Expected: 4 turns, `wages` ≈ 214500, a recommendation. **Time it** — if a debate exceeds ~25s, cache fixture debates (Task 13) rather than running live on stage.

- [ ] **Step 6: Commit**

```bash
git add app/debate.py tests/test_debate.py
git commit -m "feat: 4-round cross-vendor adversarial debate loop"
```

---

## Task 7: Deterministic validator (TDD, strict)

**Time box: 30 min.** Pure functions; demo case 5 depends on exact behavior here. Test first, no exceptions.

**Files:**
- Create: `app/validator.py`
- Create: `tests/test_validator.py`

**Interfaces:**
- Consumes: `app.models.{Case, Field, RuleResult}`
- Produces: `INDIVIDUAL_INCOME`, `JOINT_INCOME`, `NET_WORTH_MIN`, `ENTITY_ASSETS_MIN`, `validate(case: Case) -> list[RuleResult]`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_validator.py
from app.models import Case, Field
from app.validator import validate


def _case(path="income", subject="individual", **fields):
    return Case(case_id="c1", subject_type=subject, claimed_path=path,
                extracted={k: Field(value=v, confidence=0.95)
                           for k, v in fields.items()})


def _rule(results, rule_id):
    return next(r for r in results if r.rule_id == rule_id)


def test_income_passes_when_both_years_above_threshold():
    r = _rule(validate(_case(income_year_1=214500, income_year_2=230000,
                             income_current_year_expectation=220000)), "INCOME")
    assert r.outcome == "PASS"


def test_income_fails_at_199400_the_demo_case():
    """Demo case 5: agents may recommend APPROVE; this must still FAIL."""
    r = _rule(validate(_case(income_year_1=199400, income_year_2=230000,
                             income_current_year_expectation=220000)), "INCOME")
    assert r.outcome == "FAIL"
    assert "199400" in str(r.inputs_used) or 199400 in r.inputs_used.values()


def test_income_requires_both_years_not_just_average():
    r = _rule(validate(_case(income_year_1=150000, income_year_2=300000,
                             income_current_year_expectation=300000)), "INCOME")
    assert r.outcome == "FAIL"


def test_income_insufficient_data_when_a_year_is_missing():
    r = _rule(validate(_case(income_year_1=214500)), "INCOME")
    assert r.outcome == "INSUFFICIENT_DATA"


def test_joint_filing_uses_300k_threshold():
    r = _rule(validate(_case(income_year_1=250000, income_year_2=260000,
                             income_current_year_expectation=250000,
                             filing_status="joint")), "INCOME")
    assert r.outcome == "FAIL"


def test_net_worth_excludes_primary_residence():
    r = _rule(validate(_case(path="net_worth", total_assets=1_600_000,
                             total_liabilities=200_000,
                             primary_residence_value=800_000,
                             primary_residence_debt=300_000)), "NET_WORTH")
    # (1.6M - 0.8M residence) - (0.2M - 0.3M residence debt) = 0.9M
    assert r.outcome == "FAIL"


def test_net_worth_passes_above_one_million_excluding_residence():
    r = _rule(validate(_case(path="net_worth", total_assets=3_000_000,
                             total_liabilities=400_000,
                             primary_residence_value=900_000,
                             primary_residence_debt=600_000)), "NET_WORTH")
    assert r.outcome == "PASS"


def test_license_reads_solari_evidence():
    c = _case(path="license")
    c.evidence["license_check"] = {"licenses": ["Series 65"], "active": True}
    assert _rule(validate(c), "LICENSE").outcome == "PASS"


def test_license_fails_when_inactive():
    c = _case(path="license")
    c.evidence["license_check"] = {"licenses": ["Series 65"], "active": False}
    assert _rule(validate(c), "LICENSE").outcome == "FAIL"


def test_min_investment_shortcut_requires_self_certification():
    c = _case(path="min_investment")
    c.commitment_usd = 250_000
    c.evidence["self_certified_not_financed"] = False
    assert _rule(validate(c), "MIN_INVESTMENT").outcome == "FAIL"


def test_every_rule_result_carries_a_citation():
    for r in validate(_case(income_year_1=214500, income_year_2=230000,
                            income_current_year_expectation=220000)):
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
    "SHELL_COMPANY_RISK": "internal risk check (not a 501(a) test)",
}


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
    inputs = {"income_year_1": y1, "income_year_2": y2,
              "income_current_year_expectation": expectation,
              "filing_status": "joint" if joint else "individual",
              "threshold": threshold}

    if y1 is None or y2 is None:
        missing = [n for n, v in (("income_year_1", y1), ("income_year_2", y2)) if v is None]
        return _result("INCOME", "INSUFFICIENT_DATA",
                       f"Missing required prior-year income: {', '.join(missing)}", inputs)
    if expectation is None:
        return _result("INCOME", "INSUFFICIENT_DATA",
                       "Missing a reasonable expectation of current-year income, which "
                       "501(a)(6) requires in addition to the two prior years.", inputs)

    failed = [n for n, v in (("income_year_1", y1), ("income_year_2", y2),
                             ("income_current_year_expectation", expectation)) if v < threshold]
    if failed:
        return _result("INCOME", "FAIL",
                       f"501(a)(6) requires income of at least ${threshold:,} in EACH of "
                       f"the two most recent years plus a reasonable expectation for the "
                       f"current year. Below threshold: {', '.join(failed)}.", inputs)
    return _result("INCOME", "PASS",
                   f"Income of at least ${threshold:,} in each of the two most recent "
                   f"years and expected for the current year.", inputs)


def check_net_worth(case: Case) -> RuleResult:
    assets, liabilities = _num(case, "total_assets"), _num(case, "total_liabilities")
    res_val = _num(case, "primary_residence_value") or 0.0
    res_debt = _num(case, "primary_residence_debt") or 0.0
    recent_debt = _num(case, "residence_debt_added_last_60_days") or 0.0
    inputs = {"total_assets": assets, "total_liabilities": liabilities,
              "primary_residence_value": res_val, "primary_residence_debt": res_debt,
              "residence_debt_added_last_60_days": recent_debt,
              "threshold": NET_WORTH_MIN}

    if assets is None or liabilities is None:
        return _result("NET_WORTH", "INSUFFICIENT_DATA",
                       "Missing total assets or total liabilities.", inputs)

    net = (assets - res_val) - (liabilities - res_debt) - recent_debt
    inputs["computed_net_worth_excluding_residence"] = net
    if net > NET_WORTH_MIN:
        return _result("NET_WORTH", "PASS",
                       f"Net worth excluding primary residence is ${net:,.0f}, above the "
                       f"${NET_WORTH_MIN:,} threshold.", inputs)
    return _result("NET_WORTH", "FAIL",
                   f"Net worth excluding primary residence is ${net:,.0f}, at or below the "
                   f"${NET_WORTH_MIN:,} threshold.", inputs)


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
                       f"Holds {', '.join(held)} in good standing per FINRA BrokerCheck "
                       f"({ev.get('source_url', 'source unrecorded')}).", inputs)
    return _result("LICENSE", "FAIL",
                   "No active Series 7, 65, or 82 registration found on BrokerCheck.", inputs)


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
                       f"Entity holds ${best:,.0f}, above the ${ENTITY_ASSETS_MIN:,} "
                       f"threshold.", inputs)
    return _result("ENTITY_ASSETS", "FAIL",
                   f"Entity holds ${best:,.0f}, at or below the ${ENTITY_ASSETS_MIN:,} "
                   f"threshold.", inputs)


def check_min_investment(case: Case) -> RuleResult:
    commitment = case.commitment_usd
    certified = bool(case.evidence.get("self_certified_not_financed"))
    threshold = (MIN_INVEST_ENTITY if case.subject_type == "entity"
                 else MIN_INVEST_INDIVIDUAL)
    inputs = {"commitment_usd": commitment, "threshold": threshold,
              "self_certified_not_financed": certified}
    if commitment is None:
        return _result("MIN_INVESTMENT", "INSUFFICIENT_DATA",
                       "No commitment amount recorded.", inputs)
    if commitment >= threshold and certified:
        return _result("MIN_INVESTMENT", "PASS",
                       f"Commitment of ${commitment:,} meets the ${threshold:,} minimum "
                       f"and the investor certified the funds are not third-party "
                       f"financed.", inputs)
    if commitment >= threshold:
        return _result("MIN_INVESTMENT", "FAIL",
                       "Commitment meets the minimum but the required written "
                       "self-certification that funds are not third-party financed is "
                       "missing.", inputs)
    return _result("MIN_INVESTMENT", "FAIL",
                   f"Commitment of ${commitment:,} is below the ${threshold:,} minimum.",
                   inputs)


def check_shell_company_risk(case: Case) -> RuleResult:
    ev = case.evidence.get("entity_corroboration")
    inputs = {"entity_corroboration": ev}
    if not ev:
        return _result("SHELL_COMPANY_RISK", "INSUFFICIENT_DATA",
                       "No company corroboration data retrieved.", inputs)
    if not ev.get("resolved"):
        return _result("SHELL_COMPANY_RISK", "FAIL",
                       "Entity could not be resolved to a known company. Manual review "
                       "required. This is a risk signal, not an accreditation test.", inputs)
    if not ev.get("operating_business_signal"):
        return _result("SHELL_COMPANY_RISK", "FAIL",
                       "Entity resolved but shows no operating-business signals "
                       "(headcount, hiring, web traffic). Risk signal only.", inputs)
    if ev.get("adverse_news"):
        return _result("SHELL_COMPANY_RISK", "FAIL",
                       f"{len(ev['adverse_news'])} adverse news item(s) found. Risk "
                       f"signal only.", inputs)
    return _result("SHELL_COMPANY_RISK", "PASS",
                   "Entity resolves to a company with operating signals and no adverse "
                   "news. Corroboration only, not a verification of accredited status.",
                   inputs)


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

Run: `pytest tests/test_validator.py -v`
Expected: 11 passed

- [ ] **Step 5: Commit**

```bash
git add app/validator.py tests/test_validator.py
git commit -m "feat: deterministic Rule 501(a) validator with citations"
```

---

## Task 8: Triage and conflict detection (TDD, strict)

**Time box: 25 min.** This is where demo case 5 actually lands.

**Files:**
- Create: `app/triage.py`
- Create: `tests/test_triage.py`

**Interfaces:**
- Consumes: `app.models.{Case, RuleResult, AgentRecommendation, Field}`
- Produces: `CONFIDENCE_THRESHOLD = 0.85`, `NEAR_THRESHOLD_PCT = 0.05`, `detect_conflict(case) -> bool`, `triage(case) -> tuple[str, str]`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_triage.py
from app.models import Case, Field, RuleResult, AgentRecommendation
from app.triage import triage, detect_conflict


def _case(rec_decision, rule_outcome, confidence=0.95, inputs=None, disputes=None):
    return Case(
        case_id="c1", subject_type="individual", claimed_path="income",
        extracted={"income_year_1": Field(value=214500, confidence=confidence)},
        recommendation=AgentRecommendation(
            decision=rec_decision, trust_assessment="", reasoning="",
            open_disputes=disputes or []),
        validation=[RuleResult(rule_id="INCOME", citation="17 CFR 230.501(a)(6)",
                               outcome=rule_outcome,
                               inputs_used=inputs or {"income_year_1": 214500,
                                                      "threshold": 200000},
                               reason="")],
    )


def test_auto_approves_when_agents_and_validator_agree():
    decision, _ = triage(_case("APPROVE", "PASS"))
    assert decision == "auto_approved"


def test_conflict_when_agents_approve_but_validator_fails():
    """Demo case 5 — the showpiece."""
    case = _case("APPROVE", "FAIL", inputs={"income_year_1": 199400,
                                            "threshold": 200000})
    assert detect_conflict(case) is True
    decision, reason = triage(case)
    assert decision == "needs_review"
    assert "199" in reason or "conflict" in reason.lower()


def test_low_confidence_blocks_auto_approval():
    decision, reason = triage(_case("APPROVE", "PASS", confidence=0.70))
    assert decision == "needs_review"
    assert "confidence" in reason.lower()


def test_near_threshold_value_blocks_auto_approval():
    case = _case("APPROVE", "PASS", inputs={"income_year_1": 205000,
                                            "threshold": 200000})
    decision, reason = triage(case)
    assert decision == "needs_review"
    assert "threshold" in reason.lower()


def test_open_dispute_blocks_auto_approval():
    decision, reason = triage(_case("APPROVE", "PASS", disputes=["income_year_1"]))
    assert decision == "needs_review"
    assert "dispute" in reason.lower()


def test_rejects_when_both_layers_say_no():
    decision, _ = triage(_case("DENY", "FAIL"))
    assert decision == "rejected"


def test_needs_documents_when_data_is_insufficient():
    decision, _ = triage(_case("INSUFFICIENT", "INSUFFICIENT_DATA"))
    assert decision == "needs_documents"


def test_validator_pass_alone_cannot_auto_approve():
    decision, _ = triage(_case("DENY", "PASS"))
    assert decision == "needs_review"
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pytest tests/test_triage.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.triage'`

- [ ] **Step 3: Write `app/triage.py`**

```python
from app.models import Case
from app.tracing import span

CONFIDENCE_THRESHOLD = 0.85
NEAR_THRESHOLD_PCT = 0.05


def detect_conflict(case: Case) -> bool:
    """True when the agents and the validator disagree. Neither layer wins —
    disagreement always routes to a human."""
    if case.recommendation is None:
        return False
    passed = any(r.outcome == "PASS" and r.rule_id != "SHELL_COMPANY_RISK"
                 for r in case.validation)
    failed = any(r.outcome == "FAIL" and r.rule_id != "SHELL_COMPANY_RISK"
                 for r in case.validation)
    if case.recommendation.decision == "APPROVE" and failed and not passed:
        return True
    if case.recommendation.decision == "DENY" and passed:
        return True
    return False


def _near_threshold(case: Case) -> str | None:
    for r in case.validation:
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
    if low:
        return (f"extraction confidence below {CONFIDENCE_THRESHOLD} for: "
                f"{', '.join(low)}")
    return None


def triage(case: Case) -> tuple[str, str]:
    rec = case.recommendation
    rules = [r for r in case.validation if r.rule_id != "SHELL_COMPANY_RISK"]
    passed = any(r.outcome == "PASS" for r in rules)
    all_insufficient = all(r.outcome == "INSUFFICIENT_DATA" for r in rules) if rules else True

    with span("stage:triage") as s:
        if detect_conflict(case):
            failing = next((r for r in rules if r.outcome == "FAIL"), None)
            detail = failing.reason if failing else ""
            reason = (f"CONFLICT: agents recommended {rec.decision} but the "
                      f"deterministic validator disagreed. {detail}")
            s.set(decision="needs_review", conflict=True, reason=reason)
            return "needs_review", reason

        if all_insufficient:
            missing = "; ".join(r.reason for r in rules) or "no documents provided"
            s.set(decision="needs_documents", conflict=False)
            return "needs_documents", missing

        if rec is None or rec.decision != "APPROVE" or not passed:
            if rec is not None and rec.decision == "DENY" and not passed:
                reason = "Both the agent review and the validator rejected the claim."
                s.set(decision="rejected", conflict=False)
                return "rejected", reason
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

        if any(r.outcome == "FAIL" and r.rule_id == "SHELL_COMPANY_RISK"
               for r in case.validation):
            reason = "entity corroboration raised a risk signal"
            s.set(decision="needs_review", conflict=False, reason=reason)
            return "needs_review", reason

        passing = next(r for r in rules if r.outcome == "PASS")
        reason = f"{passing.rule_id} satisfied under {passing.citation}. {passing.reason}"
        s.set(decision="auto_approved", conflict=False)
        return "auto_approved", reason
```

- [ ] **Step 4: Run tests until green**

Run: `pytest tests/test_triage.py -v`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add app/triage.py tests/test_triage.py
git commit -m "feat: triage routing with agent/validator conflict detection"
```

---

## Task 9: Solari BrokerCheck adapter

**Time box: 30 min.** Shape depends on Task 4's spike outcome.

**Files:**
- Create: `app/adapters/solari.py`, `app/adapters/__init__.py`
- Create: `fixtures/cache/license_check.json`

**Interfaces:**
- Produces: `check_license(full_name: str, crd: str | None) -> dict` returning keys `licenses`, `active`, `source_url`, `screenshot_url`, `checked_at`, `cache_hit`

- [ ] **Step 1: Write the cache fixture first (this is the demo's safety net)**

```json
{
  "jane_doe_65": {
    "licenses": ["Series 65"],
    "active": true,
    "source_url": "https://brokercheck.finra.org/individual/summary/0000000",
    "screenshot_url": "/static/brokercheck_jane_doe.png",
    "checked_at": "2026-10-24T18:00:00Z",
    "cache_hit": true
  }
}
```

- [ ] **Step 2: Write `app/adapters/solari.py`**

```python
import json, os, pathlib, datetime
from app.tracing import span

CACHE = json.loads(pathlib.Path("fixtures/cache/license_check.json").read_text())
TIMEOUT_S = 45


def _cache_key(full_name: str) -> str:
    return full_name.lower().replace(" ", "_") + "_65"


def _cached(full_name: str) -> dict:
    return CACHE.get(_cache_key(full_name)) or {
        "licenses": [], "active": False, "source_url": "",
        "screenshot_url": "", "checked_at": "", "cache_hit": True,
    }


def check_license(full_name: str, crd: str | None = None) -> dict:
    """Drive a Solari cloud browser to FINRA BrokerCheck. Falls back to cache on
    any failure or timeout — a flaky browser must never break the demo."""
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
    """Fill in from the Solari docs after the Task 4 spike. Must: open a cloud
    browser, go to https://brokercheck.finra.org/, search full_name or crd, read
    registration rows, capture a screenshot, return the dict shape above."""
    raise NotImplementedError("wire from Solari docs after spike")
```

- [ ] **Step 3: Wire `_live_lookup` using what Task 4 learned, then verify**

Run: `DEMO_MODE=live python -c "from app.adapters.solari import check_license; print(check_license('Jane Doe'))"`
Expected: real licenses and a screenshot URL, or a silent cache fallback. **Either outcome is acceptable** — verify the fallback path works by running with a bogus API key.

- [ ] **Step 4: Commit**

```bash
git add app/adapters/ fixtures/cache/license_check.json
git commit -m "feat: Solari BrokerCheck adapter with cache fallback"
```

---

## Task 10: akta.pro entity corroboration adapter

**Time box: 25 min.** Entity cases only.

**Files:**
- Create: `app/adapters/akta.py`
- Create: `fixtures/cache/entity_corroboration.json`

**Interfaces:**
- Produces: `enrich_entity(name: str, domain: str | None) -> dict` returning `resolved`, `headcount`, `funding_total`, `operating_business_signal`, `adverse_news`, `cache_hit`

- [ ] **Step 1: Write the cache fixture**

Two entries: one healthy operating company, one unresolvable shell (`resolved: false`) for demo case 3.

- [ ] **Step 2: Write `app/adapters/akta.py`**

```python
import json, os, pathlib, httpx
from app.tracing import span

BASE = "https://api.akta.pro"
CACHE = json.loads(pathlib.Path("fixtures/cache/entity_corroboration.json").read_text())


def _cached(name: str) -> dict:
    return CACHE.get(name.lower()) or {
        "resolved": False, "headcount": None, "funding_total": None,
        "operating_business_signal": False, "adverse_news": [], "cache_hit": True,
    }


def enrich_entity(name: str, domain: str | None = None) -> dict:
    """Company/org-level corroboration ONLY. akta.pro has no individual-level data,
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
    """Company Search → Company Data → News Signals. Confirm exact paths against
    docs.akta.pro; the endpoint names are documented, the URL shapes are not."""
    key = os.environ["AKTA_API_KEY"]
    headers = {"Authorization": f"Bearer {key}"}
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
    adverse = [
        {"title": n.get("title", ""), "sentiment": n.get("sentiment", ""),
         "date": n.get("published_at", "")}
        for n in (news.get("articles") or news.get("data") or [])
        if str(n.get("sentiment", "")).lower() in ("negative", "very_negative")
    ]
    return {
        "resolved": True,
        "headcount": headcount,
        "funding_total": data.get("funding_total"),
        "operating_business_signal": bool(headcount and headcount > 0),
        "adverse_news": adverse[:5],
    }
```

- [ ] **Step 3: Verify both modes**

Run: `python -c "from app.adapters.akta import enrich_entity; print(enrich_entity('Acme Holdings LLC'))"` (cached)
Then: `DEMO_MODE=live ...` against a real company. If the endpoint paths are wrong, fix them from `docs.akta.pro` — **do not exceed the time box**, the cache carries the demo.

- [ ] **Step 4: Commit**

```bash
git add app/adapters/akta.py fixtures/cache/entity_corroboration.json
git commit -m "feat: akta.pro entity corroboration with cache fallback"
```

---

## Task 11: Pipeline orchestration and SSE streaming

**Time box: 40 min.** Replaces Task 1's mock `/run`.

**Files:**
- Create: `app/pipeline.py`
- Modify: `app/main.py` (replace `run_mock`)

**Interfaces:**
- Consumes: everything above
- Produces: `run_pipeline(case: Case) -> Iterator[dict]` yielding `{"stage", "status", "detail"}`

- [ ] **Step 1: Write `app/pipeline.py`**

```python
import datetime
from typing import Iterator
from app.models import Case, AuditEvent
from app.nicrron import classify_document
from app.debate import run_debate
from app.validator import validate
from app.triage import triage
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

    with span("case", case_id=case.case_id, claimed_path=case.claimed_path):
        # EXTRACT — classify, then debate each document
        yield {"stage": "extract", "status": "running", "detail": "classifying documents"}
        with span("stage:extract"):
            for doc in case.documents:
                doc.doc_type = classify_document(doc)
                result = run_debate(doc)
                case.debate.extend(result.turns)
                case.extracted.update(result.fields)
                case.recommendation = result.recommendation
                for turn in result.turns:
                    venue.post_turn(thread, turn.actor, turn.model, turn.model_dump())
                _audit(case, "extract", turn.actor if result.turns else "extractor",
                       f"{doc.filename}: {len(result.fields)} fields, "
                       f"{sum(len(t.challenges) for t in result.turns)} challenges")
        venue.save_version(case, "extract")
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
        yield {"stage": "enrich", "status": "done", "detail": "evidence gathered"}

        # VALIDATE — deterministic
        yield {"stage": "validate", "status": "running", "detail": "Rule 501(a) checks"}
        with span("stage:validate"):
            case.validation = validate(case)
        venue.save_version(case, "validate")
        yield {"stage": "validate", "status": "done",
               "detail": "; ".join(f"{r.rule_id}={r.outcome}" for r in case.validation)}

        # TRIAGE
        yield {"stage": "triage", "status": "running", "detail": "routing"}
        case.decision, case.decision_reason = triage(case)
        from app.triage import detect_conflict
        case.conflict = detect_conflict(case)
        _audit(case, "triage", "system", f"{case.decision}: {case.decision_reason}")
        yield {"stage": "triage", "status": "done", "detail": case.decision}

        # ISSUE
        if case.decision == "auto_approved":
            yield {"stage": "issue", "status": "running", "detail": "drafting letter"}
            with span("stage:issue"):
                case.letter_md = draft_letter(case)
            _audit(case, "issue", "system", "letter issued")
            yield {"stage": "issue", "status": "done", "detail": "letter ready"}

        case.trace_url = current_trace_url()
        venue.save_version(case, "final")
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
    case = CASES.get(case_id)
    if not case:
        raise HTTPException(404, "case not found")

    def stream():
        for event in run_pipeline(case):
            yield f"data: {json.dumps(event)}\n\n"
        yield f"data: {json.dumps({'stage': 'case', 'status': 'done', 'detail': case.decision})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
```

- [ ] **Step 3: Run one case end to end**

```bash
curl -N -X POST localhost:8000/cases/<id>/run
```
Expected: stage events streaming in order `extract → enrich → validate → triage → [issue] → complete`.

- [ ] **Step 4: Commit**

```bash
git add app/pipeline.py app/main.py
git commit -m "feat: pipeline orchestration with SSE stage streaming"
```

---

## Task 12: Roundtable venue and letter generation

**Time box: 45 min.**

**Files:**
- Create: `app/venue.py`, `app/letter.py`

**Interfaces:**
- Produces: `get_venue() -> DebateVenue`, `LocalJsonVenue`, `RoundtableVenue`, `draft_letter(case: Case) -> str`

- [ ] **Step 1: Write `app/venue.py` with the local impl first**

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
            f.write(json.dumps({"actor": actor, "model": model, "content": content}) + "\n")

    def save_version(self, case: Case, stage: str) -> str:
        p = OUT / f"{case.case_id}_{stage}.json"
        p.write_text(case.model_dump_json(indent=2))
        return str(p)


class RoundtableVenue:
    """Debate thread + versioned case file in a Roundtable workspace. Every method
    falls back to local on failure — Roundtable must never break the pipeline."""

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
        with span("roundtable.post_turn", actor=actor):
            try:
                self._c.messages.create(
                    thread_id=thread, author=f"{actor} ({model})",
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
    "You draft accreditation verification letters for a Rule 506(c) offering. "
    "Every figure, citation, and the determination itself are FIXED INPUTS — "
    "reproduce them exactly and never recompute, reinterpret, or soften them. "
    "Reply with JSON only."
)


def draft_letter(case: Case) -> str:
    passing = [r for r in case.validation if r.outcome == "PASS"]
    facts = {
        "subject_name": case.subject_name or "the investor",
        "subject_type": case.subject_type,
        "determination": "ACCREDITED",
        "basis": [{"rule_id": r.rule_id, "citation": r.citation, "reason": r.reason,
                   "inputs_used": r.inputs_used} for r in passing],
        "agent_review": {
            "extractor_and_challenger_agreed": not case.conflict,
            "trust_assessment": (case.recommendation.trust_assessment
                                 if case.recommendation else ""),
        },
        "evidence_sources": list(case.evidence.keys()),
    }
    with span("letter.draft", model=ADJUDICATOR_MODEL) as s:
        out = complete_json(
            ADJUDICATOR_MODEL, SYSTEM,
            "Write a short formal verification letter in Markdown from these fixed "
            'facts. Reply {"letter_md": "..."}. Include: determination, the statutory '
            "basis with citation, which documents and sources were reviewed, a note "
            "that two independent AI models reviewed the documents and a deterministic "
            "validator confirmed the thresholds, and that this verification is valid "
            f"for 90 days.\n\nFacts: {facts}")
        letter = out.get("letter_md", "")
        s.set(letter_len=len(letter))
    return letter
```

- [ ] **Step 3: Verify both**

Run: `python -c "from app.venue import get_venio" 2>/dev/null; python -c "from app.venue import get_venue; v=get_venue(); print(type(v).__name__, v.open_thread('case_x'))"`
Expected: `RoundtableVenue` with a real thread id, or `LocalJsonVenue` — both acceptable.

- [ ] **Step 4: Commit**

```bash
git add app/venue.py app/letter.py
git commit -m "feat: Roundtable debate venue and letter generation"
```

---

## Task 13: Demo fixtures, caching, and rehearsal

**Time box: 40 min.** Do not skip. An unrehearsed demo is a failed demo.

**Files:**
- Create: `fixtures/cases/case1_clean_income.json` … `case5_conflict.json`
- Create: `scripts/seed_demo.py`

- [ ] **Step 1: Build the five fixture cases from spec §9**

1. Clean individual income — 2× W-2 + 1040, all above threshold
2. Series 65 license holder (uses the real public CRD from Task 4)
3. Entity LLC — resolves to the shell entry in the akta cache
4. Doctored bank statement — internally inconsistent totals so the challenger catches it
5. **Income `199,400`** — must produce `conflict: true` and `needs_review`

- [ ] **Step 2: Write `scripts/seed_demo.py`**

Loads all five fixtures, POSTs each case, uploads its documents, runs the pipeline, and prints a decision table.

- [ ] **Step 3: Run the seed and verify every decision matches the spec table**

Run: `python scripts/seed_demo.py`
Expected: `auto_approved, auto_approved, needs_review, needs_review, needs_review` — and case 5 must show `conflict: true`. If case 5 does not conflict, adjust the fixture income until the agents approve and the validator fails; **that beat is the demo's centerpiece.**

- [ ] **Step 4: Run the WiFi-down drill**

Disconnect WiFi, set `DEMO_MODE=cached`, run `scripts/seed_demo.py` again. Every case must still complete. Any crash here is a P0 — fix it before anything else.

- [ ] **Step 5: Commit**

```bash
git add fixtures/ scripts/seed_demo.py
git commit -m "feat: five demo fixtures, cached responses, offline drill"
```

---

## Task 14 (DEFERRED — only if time remains): Deterministic parser cross-check

Per the user's direction, this comes **last** and only if the demo is already safe. It is the second backend engineer's parser, slotted in as an independent second extraction.

**Files:**
- Modify: `app/validator.py` (add the cross-check), `app/triage.py` (honor it)

- [ ] **Step 1: Write the failing test**

```python
# tests/test_validator.py (append)
from app.validator import cross_check_extraction
from app.models import Field

def test_cross_check_flags_disagreement():
    agent = {"income_year_1": Field(value=214500, confidence=0.95)}
    deterministic = {"income_year_1": 198000}
    conflict, notes = cross_check_extraction(agent, deterministic)
    assert conflict is True
    assert "income_year_1" in notes[0]

def test_cross_check_raises_confidence_on_agreement():
    agent = {"income_year_1": Field(value=214500, confidence=0.80)}
    deterministic = {"income_year_1": 214500}
    conflict, _ = cross_check_extraction(agent, deterministic)
    assert conflict is False
    assert agent["income_year_1"].confidence > 0.80
```

- [ ] **Step 2: Run it and watch it fail, then implement**

```python
def cross_check_extraction(agent_fields: dict, deterministic: dict
                           ) -> tuple[bool, list[str]]:
    """Two independent extractions corroborating each other. Agreement raises
    confidence; disagreement forces human review."""
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

- [ ] **Step 3: Run tests, then commit**

```bash
pytest tests/test_validator.py -v
git add app/validator.py tests/test_validator.py
git commit -m "feat: deterministic parser cross-check as second extraction"
```

---

## Self-Review Notes

**Spec coverage:** §4 architecture → Tasks 1, 11. §5.1 Nicrron debate → Tasks 5, 6. §5.2 Roundtable → Task 12. §5.3 PRISM → Task 2 (spans added throughout). §5.4 akta.pro → Task 10. §5.5 Solari → Tasks 4, 9. §6 validator → Task 7. §7 triage → Task 8. §8 API contract → Task 1. §9 demo cases → Task 13. §10 risk fallbacks → Tasks 2, 9, 10, 12 (every adapter has one). §12 open questions → Tasks 3, 4 resolve two of them.

**Known gaps, deliberate:** the GP dashboard UI is the frontend engineer's work against Task 1's contract. Letter PDF rendering is out (Markdown only). `app/main.py` holds state in a module-level dict — correct for a one-session demo, wrong for anything else.
