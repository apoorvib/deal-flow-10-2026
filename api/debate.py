"""Cross-vendor adversarial document review (assumptions.md A3-A9).

Per document at upload: extract (OpenAI) -> challenge (Anthropic) -> respond
(OpenAI, skipped if no challenges) -> adjudicate (OpenAI). Case level at submit:
one challenger-vendor pass over every parsed document together.

Never raises: any model failure degrades to a low-confidence flagged result,
which escalates to human review (A8). Results are cached by content hash so the
demo runs offline (A9).
"""

from __future__ import annotations

import datetime
import hashlib
import json
import os
import re
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

from api.models import ParsedDocument
from api.nicrron import (ADJUDICATOR_MODEL, CHALLENGER_MODEL, EXTRACTOR_MODEL, VISION_ENABLED,
                         classify, complete_json)
from api.venue import get_venue

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "fixtures" / "cache" / "debates"

TEXT_FAILURE_MODES = [
    "misread_or_transposed_digits", "wrong_field", "stale_or_wrong_tax_year",
    "cross_document_inconsistency", "face_arithmetic_error", "impossible_dates",
    "unsupported_inference",
]
FIELDS = ["income", "balance", "holderName", "taxYear", "statementDate"]


def failure_modes() -> list[str]:
    return TEXT_FAILURE_MODES + (["signs_of_alteration"] if VISION_ENABLED else [])


def demo_mode() -> str:
    return os.getenv("DEMO_MODE", "cached")


@dataclass
class DebateTurn:
    round: int
    actor: str
    model: str
    output: dict
    seconds: float = 0.0


@dataclass
class DocReview:
    """Server-side record (store collection `doc_reviews`), never on the wire."""
    doc_id: str
    sha256: str
    turns: list = field(default_factory=list)
    trust_assessment: str = ""
    degraded: bool = False
    cache_hit: bool = False
    seconds: float = 0.0


# --- helpers -----------------------------------------------------------------

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _num(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = re.sub(r"[^0-9.\-]", "", str(v))
    try:
        return float(s) if s not in ("", "-", ".") else None
    except ValueError:
        return None


def _int(v):
    n = _num(v)
    return int(n) if n is not None else None


def _val(fields: dict, name: str):
    f = fields.get(name)
    return f.get("value") if isinstance(f, dict) else f


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _cache_get(key: str) -> dict | None:
    p = CACHE_DIR / f"{key}.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return None
    return None


def _cache_put(key: str, data: dict) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        (CACHE_DIR / f"{key}.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception:
        pass


# --- prompts -----------------------------------------------------------------

_EXTRACT_SYS = """You extract fields from ONE financial document for an accredited-investor verification system.
Reply with JSON only: {"fields": {<name>: {"value": ..., "confidence": 0-1, "sourceQuote": "<exact text from the document>"}}}
Fields: income (number), balance (number), holderName (string), taxYear (integer), statementDate (YYYY-MM-DD).
Rules:
- OMIT any field the document does not explicitly state. Never guess.
- income: for a Form 1040 use ADJUSTED GROSS INCOME (line 11), NOT total income (line 9). For a W-2 use Box 1 wages. For a K-1 use the stated income figure. Statements have no income.
- balance: for bank/brokerage statements, the STATED closing/ending balance exactly as printed (do not recompute it).
- statementDate: the end of the statement period.
- Numbers as plain numbers (185000.0), no currency symbols."""

_CHALLENGE_SYS = """You are an adversarial reviewer from a DIFFERENT AI vendor than the extractor. Find real errors in the extraction, and check the document itself for internal problems.
Reply with JSON only: {"challenges": [{"fieldName": "<field or 'document'>", "failureMode": "<mode>", "reason": "<specific, tied to quoted document text>"}]}
Failure modes (use exactly these names): MODES
Check specifically:
- wrong_field: 1040 income must be AGI (line 11), not total income (line 9); W-2 must be Box 1.
- face_arithmetic_error: recompute any totals on the document (e.g. opening + deposits - withdrawals must equal closing). Report mismatches with the numbers.
- impossible_dates: e.g. a 'generated'/'issued' date that precedes the period the document reports.
Every challenge MUST cite specific document text. Vague doubt is not a challenge.
If the extraction is correct and the document is internally consistent, return {"challenges": []} -- an empty list is the correct answer then."""

_RESPOND_SYS = """You extracted fields from a document; a reviewer challenged some. For each challenge, either CONCEDE (give revisedValue, or null if the field should be removed) or DEFEND (quote the document).
Challenges about the document itself (fieldName 'document') cannot be fixed by you: DEFEND only if the reviewer is factually wrong about the document, otherwise CONCEDE with revisedValue null.
Reply with JSON only: {"resolutions": [{"fieldName": "...", "action": "CONCEDE"|"DEFEND", "revisedValue": <value or null>, "justification": "..."}]}"""

_ADJUDICATE_SYS = """You adjudicate a debate about one financial document. You see the document, the extraction, the challenges and the responses.
Reply with JSON only:
{"fields": {<name>: {"value": ..., "confidence": 0-1, "sourceQuote": "..."}}, "confidence": 0-1, "flags": ["<short plain-English issue>"], "summary": "<one line>", "trustAssessment": "<one sentence>"}
Rules:
- Final field values only from what the document states. 1040 income = AGI (line 11).
- flags: one short sentence per UNRESOLVED or valid problem (arithmetic that does not reconcile, impossible dates, wrong field, signs of alteration). Empty list if none.
- confidence: your overall confidence the fields are correct AND the document is genuine and internally consistent. Use >= 0.9 only when there are no flags.
- summary style: "Form W-2 for tax year 2024, $185,000 reported." / "Bank statement ending 2026-09-30, $702,461.77 closing balance."
- You do NOT apply dollar thresholds or decide accreditation. A deterministic engine does that."""

_CASE_SYS = """You review a SET of already-extracted financial documents belonging to one applicant, together with what the applicant self-reported.
Reply with JSON only: {"crossDocumentIssues": ["<short sentence>"], "recommendation": "APPROVE"|"DENY"|"INSUFFICIENT", "rationale": "<one or two sentences>"}
- crossDocumentIssues: inconsistencies BETWEEN documents only (different holder names or employers, a 1040 and W-2 for the same year that disagree, mismatched years). Empty list if none.
- recommendation: your opinion on whether this applicant meets the stated accreditation pathway. Rule 501(a)(6) income: >= $200,000 individual / $300,000 joint in EACH of the two most recent years (an average does not qualify). Your recommendation is advisory only; a deterministic engine decides."""


# Demo fixtures carry a "SYNTHETIC SPECIMEN" banner by design (never bind real people to fake
# financials). Without this note the reviewers flag the banner itself, sinking every document.
_SPECIMEN_NOTE = ("\nNOTE: Documents in this environment are test specimens and may carry a "
                  "'SYNTHETIC SPECIMEN - NOT A REAL DOCUMENT' banner. That banner is expected: do NOT treat it "
                  "as a defect, a flag, or a reason to lower confidence. Judge the document's contents only.")


# --- per-document debate -------------------------------------------------------

def _doc_block(text: str, filename: str, doc_type: str) -> str:
    return f"Filename: {filename}\nDocument type: {doc_type}\n\nDocument text (may be empty if image only):\n{text or '(see image)'}"


def run_debate(text: str, filename: str, doc_type: str, image_b64: str | None = None,
               thread_id: str | None = None) -> tuple[dict, list[DebateTurn]]:
    """The 4 rounds. Returns (adjudication dict, turns). May raise; caller degrades."""
    doc = _doc_block(text, filename, doc_type)
    turns: list[DebateTurn] = []
    venue = get_venue()
    thread_id = thread_id or venue.open_thread("document", filename, {"doc_type": doc_type})

    def call(rnd, actor, model, system, user):
        t0 = time.monotonic()
        out = complete_json(model, system, user, image_b64=image_b64)
        turns.append(DebateTurn(rnd, actor, model, out, round(time.monotonic() - t0, 2)))
        try:
            venue.post_message(thread_id, f"{actor} ({model})", out,
                               {"round": rnd, "seconds": turns[-1].seconds})
        except Exception:  # noqa: BLE001
            pass
        return out

    r1 = call(1, "extractor", EXTRACTOR_MODEL, _EXTRACT_SYS + _SPECIMEN_NOTE, doc)
    fields = dict(r1.get("fields") or {})

    sys2 = _CHALLENGE_SYS.replace("MODES", ", ".join(failure_modes())) + _SPECIMEN_NOTE
    r2 = call(2, "challenger", CHALLENGER_MODEL, sys2, f"{doc}\n\nExtraction:\n{json.dumps(fields, indent=2)}")
    challenges = r2.get("challenges") or []

    r3 = {"resolutions": []}
    if challenges:
        r3 = call(3, "extractor", EXTRACTOR_MODEL, _RESPOND_SYS + _SPECIMEN_NOTE,
                  f"{doc}\n\nYour extraction:\n{json.dumps(fields, indent=2)}\n\nChallenges:\n{json.dumps(challenges, indent=2)}")
        for res in r3.get("resolutions") or []:
            name = res.get("fieldName")
            if res.get("action") == "CONCEDE" and name in FIELDS:
                if res.get("revisedValue") is None:
                    fields.pop(name, None)
                else:
                    fields[name] = {"value": res["revisedValue"], "confidence": 0.8,
                                    "sourceQuote": res.get("justification", "")}

    r4 = call(4, "adjudicator", ADJUDICATOR_MODEL, _ADJUDICATE_SYS + _SPECIMEN_NOTE,
              f"{doc}\n\nExtraction (after concessions):\n{json.dumps(fields, indent=2)}\n\n"
              f"Challenges:\n{json.dumps(challenges, indent=2)}\n\nResponses:\n{json.dumps(r3, indent=2)}")
    if not r4.get("fields"):
        r4["fields"] = fields
    try:
        venue.version(thread_id, "adjudicated", {"adjudication": r4, "turns": [asdict(t) for t in turns]})
    except Exception:  # noqa: BLE001
        pass
    return r4, turns


def _assemble(adj: dict, doc_id: str, filename: str, doc_type: str) -> ParsedDocument:
    f = adj.get("fields") or {}
    conf = _num(adj.get("confidence"))
    conf = 0.0 if conf is None else max(0.0, min(1.0, conf))
    flags = [str(x) for x in (adj.get("flags") or []) if str(x).strip()]
    sd = _val(f, "statementDate")
    return ParsedDocument(
        id=doc_id, file_name=filename, doc_type=doc_type,
        holder_name=(_val(f, "holderName") or None),
        tax_year=_int(_val(f, "taxYear")),
        statement_date=str(sd) if sd else None,
        income=_num(_val(f, "income")) if doc_type in ("w2", "form_1040", "k1", "cpa_letter") else None,
        balance=_num(_val(f, "balance")) if doc_type in ("bank_statement", "brokerage_statement", "cpa_letter") else None,
        confidence=round(conf, 3), flags=flags,
        summary=str(adj.get("summary") or "Document reviewed."), created_at=_now(),
    )


def degraded(doc_id: str, filename: str, reason: str, doc_type: str = "other") -> ParsedDocument:
    return ParsedDocument(id=doc_id, file_name=filename, doc_type=doc_type, holder_name=None, tax_year=None,
                          statement_date=None, income=None, balance=None, confidence=0.0,
                          flags=[f"Automated review incomplete: {reason}"],
                          summary="Automated review incomplete; a reviewer will read this document.",
                          created_at=_now())


def parse_upload(data: bytes, text: str, filename: str, doc_id: str,
                 image_b64: str | None = None) -> tuple[ParsedDocument, DocReview]:
    """Entry point for POST /documents. Never raises."""
    key = sha256(data)
    review = DocReview(doc_id=doc_id, sha256=key)
    t0 = time.monotonic()
    venue = get_venue()
    thread_id = venue.open_thread("document", filename, {"doc_id": doc_id})

    cached = _cache_get(key)
    if cached:
        doc = _assemble(cached["adjudication"], doc_id, filename, cached["docType"])
        review.turns, review.cache_hit = cached.get("turns", []), True
        review.trust_assessment = cached["adjudication"].get("trustAssessment", "")
        try:
            venue.version(thread_id, "cached", {"docType": cached["docType"], "turns": review.turns,
                                                 "adjudication": cached["adjudication"]})
        except Exception:  # noqa: BLE001
            pass
        return doc, review

    if demo_mode() == "cached":
        review.degraded = True
        return degraded(doc_id, filename, "offline mode and no cached review for this file"), review

    try:
        doc_type = classify(text or "(image only)", filename, image_b64=image_b64)
    except Exception as e:  # noqa: BLE001
        review.degraded = True
        return degraded(doc_id, filename, f"classification failed ({type(e).__name__})"), review

    try:
        adj, turns = run_debate(text, filename, doc_type, image_b64, thread_id)
        doc = _assemble(adj, doc_id, filename, doc_type)
    except Exception as e:  # noqa: BLE001
        review.degraded = True
        return degraded(doc_id, filename, f"model review failed ({type(e).__name__})", doc_type), review

    review.turns = [asdict(t) for t in turns]
    review.trust_assessment = str(adj.get("trustAssessment", ""))
    review.seconds = round(time.monotonic() - t0, 2)
    _cache_put(key, {"docType": doc_type, "adjudication": adj, "turns": review.turns, "seconds": review.seconds})
    return doc, review


# --- case-level review (at submit) --------------------------------------------------

def review_case(docs: list[ParsedDocument], pathway: str, investor_type: str, self_reported: dict) -> dict:
    """Returns {crossDocumentIssues, recommendation, rationale, cache_hit, degraded}. Never raises."""
    empty = {"crossDocumentIssues": [], "recommendation": "INSUFFICIENT", "rationale": "", "cache_hit": False, "degraded": True}
    if not docs:
        return {**empty, "rationale": "No documents."}
    slim = [d.model_dump(by_alias=True, exclude={"id", "created_at"}) for d in docs]
    payload = json.dumps({"pathway": pathway, "investorType": investor_type,
                          "selfReported": self_reported, "documents": slim}, sort_keys=True)
    key = "case_" + sha256(payload.encode())
    cached = _cache_get(key)
    if cached:
        return {**cached, "cache_hit": True, "degraded": False}
    if demo_mode() == "cached":
        return {**empty, "rationale": "Offline mode and no cached case review."}
    try:
        # PRISM span: debate.case_review attaches here.
        venue = get_venue()
        thread_id = venue.open_thread("case", f"{investor_type}:{pathway}",
                                      {"pathway": pathway, "investor_type": investor_type})
        venue.post_message(thread_id, f"challenger ({CHALLENGER_MODEL})", payload,
                           {"stage": "case_review_input"})
        out = complete_json(CHALLENGER_MODEL, _CASE_SYS + _SPECIMEN_NOTE, payload)
        res = {"crossDocumentIssues": [str(x) for x in (out.get("crossDocumentIssues") or [])],
               "recommendation": out.get("recommendation") if out.get("recommendation") in ("APPROVE", "DENY", "INSUFFICIENT") else "INSUFFICIENT",
               "rationale": str(out.get("rationale", "")), "model": CHALLENGER_MODEL}
    except Exception as e:  # noqa: BLE001
        return {**empty, "rationale": f"Case review failed ({type(e).__name__})."}
    try:
        venue.version(thread_id, "case_review", res)
        res["venue_thread_id"] = thread_id
    except Exception:  # noqa: BLE001
        pass
    _cache_put(key, res)
    return {**res, "cache_hit": False, "degraded": False}
