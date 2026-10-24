"""Savy API: health check and the SEC accreditation rules engine (POST /api/evaluate).

Database: the connection string comes from VITE_SUPABASE_URL, which must be a
Postgres DSN (postgresql://...), not the https://<ref>.supabase.co project URL.
If it isn't set, DATABASE_URL is used (the docker-compose setup).
"""

import os


def _resolve_database_url() -> None:
    url = (os.getenv("VITE_SUPABASE_URL") or "").strip()
    if url:
        if url.startswith("http://") or url.startswith("https://"):
            raise RuntimeError(
                "VITE_SUPABASE_URL is an HTTP project URL. SQLAlchemy needs the Postgres "
                "connection string (Supabase > Project Settings > Database), e.g. "
                "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
            )
        if url.startswith("postgres://"):
            url = "postgresql+psycopg2://" + url[len("postgres://"):]
        elif url.startswith("postgresql://"):
            url = "postgresql+psycopg2://" + url[len("postgresql://"):]
        os.environ["DATABASE_URL"] = url
    elif not os.getenv("DATABASE_URL"):
        raise RuntimeError("Set VITE_SUPABASE_URL (or DATABASE_URL) to a Postgres connection string")


# Must run before database.py is imported: it reads DATABASE_URL at import time.
_resolve_database_url()

import hashlib  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402
from datetime import datetime, timezone  # noqa: E402
from decimal import Decimal  # noqa: E402
from typing import Any  # noqa: E402
from uuid import UUID  # noqa: E402

from fastapi import Depends, FastAPI, HTTPException  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from database import Base, audit_session, engine, get_db  # noqa: E402
from enums import AttemptStatus, Decision, InvestorType, Pathway, Recommendation  # noqa: E402
from models import Fund, Investor, VerificationAttempt, append_audit_log  # noqa: E402
from schemas import (  # noqa: E402
    INCOME_INDIVIDUAL,
    INCOME_JOINT,
    NET_WORTH,
    Check,
    ConsensusRejected,
    Evaluation,
    QuoteCheck,
    RoundtablePayload,
    WireModel,
    verify_source_quotes,
)

ACTOR = "rules_engine"


# --------------------------------------------------------------------------- #
# App setup
# --------------------------------------------------------------------------- #


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Phase 1/2 only; Alembic migrations replace this later.
    Base.metadata.create_all(bind=engine)
    yield
    engine.dispose()


app = FastAPI(title="Savy API", lifespan=lifespan)


@app.get("/api/health")
def api_health() -> dict[str, str]:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}


# Kept so the docker-compose healthcheck (GET /health) keeps working.
@app.get("/health", include_in_schema=False)
def health() -> dict[str, str]:
    return api_health()


# --------------------------------------------------------------------------- #
# SEC rules engine (Rule 501(a)): deterministic, Decimal-only
# --------------------------------------------------------------------------- #


def _usd(v: Decimal) -> str:
    return f"${v:,.2f}"


def evaluate_income(payload: RoundtablePayload, investor_type: InvestorType) -> Evaluation:
    """Income test: $200k individual / $300k joint. Every reported income figure
    must meet the threshold (the SEC requires it in each of the two most recent years)."""
    if investor_type is InvestorType.ENTITY:
        return Evaluation(
            decision=Decision.DENIED,
            checks=[Check(id="income_investor_type", label="Investor type", result="fail",
                          detail="The income test applies to natural persons, not entities")],
            reasons=["Income pathway is not available to entity investors"],
        )

    joint = investor_type is InvestorType.JOINT
    threshold = INCOME_JOINT if joint else INCOME_INDIVIDUAL
    label = "joint" if joint else "individual"

    checks: list[Check] = []
    reasons: list[str] = []
    figures = [(d, d.fields.income) for d in payload.documents if d.fields.income is not None]

    if not figures:
        return Evaluation(
            decision=Decision.DENIED,
            checks=[Check(id="income_present", label="Income figure", result="fail",
                          detail="No income figure was extracted from any document")],
            reasons=["No income figure found in the submitted documents"],
        )

    for doc, inc in figures:
        year = doc.fields.tax_year.value if doc.fields.tax_year else None
        passed = inc.value >= threshold
        detail = (f"{doc.file_name}{f' ({year})' if year else ''}: {_usd(inc.value)} "
                  f"{'>=' if passed else '<'} {_usd(threshold)} {label} threshold")
        checks.append(Check(id=f"income_{doc.document_id}", label="Income threshold",
                            result="pass" if passed else "fail", detail=detail))
        if not passed:
            reasons.append(detail)

    decision = Decision.APPROVED if not reasons else Decision.DENIED
    return Evaluation(decision=decision, checks=checks, reasons=reasons)


def evaluate_net_worth(payload: RoundtablePayload) -> Evaluation:
    """Net worth test: $1M, summed across the submitted balances (primary residence
    is excluded upstream; statements should not include it)."""
    balances = [(d, d.fields.balance) for d in payload.documents if d.fields.balance is not None]
    if not balances:
        return Evaluation(
            decision=Decision.DENIED,
            checks=[Check(id="net_worth_present", label="Balance figure", result="fail",
                          detail="No balance figure was extracted from any document")],
            reasons=["No account balance found in the submitted documents"],
        )

    total = sum((b.value for _, b in balances), Decimal("0"))
    passed = total >= NET_WORTH
    detail = (f"Total of {len(balances)} balance(s): {_usd(total)} "
              f"{'>=' if passed else '<'} {_usd(NET_WORTH)} net worth threshold")
    return Evaluation(
        decision=Decision.APPROVED if passed else Decision.DENIED,
        checks=[Check(id="net_worth_total", label="Net worth threshold",
                      result="pass" if passed else "fail", detail=detail)],
        reasons=[] if passed else [detail],
    )


def run_rules_engine(payload: RoundtablePayload, investor_type: InvestorType) -> Evaluation:
    if payload.pathway is Pathway.INCOME:
        result = evaluate_income(payload, investor_type)
    elif payload.pathway is Pathway.NET_WORTH:
        result = evaluate_net_worth(payload)
    else:
        raise HTTPException(status_code=422,
                            detail=f"Pathway {payload.pathway.value!r} is not supported by /api/evaluate")

    # The adjudicator's recommendation is recorded but never decides the outcome.
    agrees = (payload.recommendation is Recommendation.APPROVE) == (result.decision is Decision.APPROVED)
    result.checks.append(Check(
        id="adjudicator_recommendation", label="Adjudicator recommendation",
        result="pass" if agrees else "warn",
        detail=f"Roundtable recommended {payload.recommendation.value}; rules engine decided {result.decision.value}",
    ))
    return result


# --------------------------------------------------------------------------- #
# POST /api/evaluate
# --------------------------------------------------------------------------- #


class EvaluateResponse(WireModel):
    verification_attempt_id: UUID
    status: AttemptStatus
    decision: Decision
    evaluation: Evaluation
    quote_checks: list[QuoteCheck]
    audit_entry_hash: str
    evaluated_at: datetime


def _combined_document_text(payload: RoundtablePayload) -> str:
    # One attempt row stores the whole document set; each part is labelled.
    return "\n\n".join(
        f"===== document {d.document_id}: {d.file_name} =====\n{d.raw_document_text}"
        for d in payload.documents
    )


def _extracted_figures(payload: RoundtablePayload, checks: list[QuoteCheck]) -> dict[str, Any]:
    return {
        "consensusId": payload.consensus_id,
        "recommendation": payload.recommendation.value,
        "models": payload.models.model_dump(mode="json", by_alias=True),
        "documents": [
            {
                "documentId": d.document_id,
                "fileName": d.file_name,
                "docType": d.doc_type.value,
                "rawDocumentSha256": d.text_sha256,
                "confidence": d.confidence,
                "fields": d.fields.model_dump(mode="json", by_alias=True, exclude_none=True),
            }
            for d in payload.documents
        ],
        "quoteChecks": [c.model_dump(mode="json", by_alias=True) for c in checks],
    }


def _write_audit(event_type: str, payload: dict[str, Any], attempt_id: UUID, investor_id: UUID) -> str:
    """Hash-chained audit write on its own transaction (see database.audit_session)."""
    with audit_session() as adb:
        entry = append_audit_log(
            adb,
            event_type=event_type,
            actor=ACTOR,
            payload=payload,
            verification_attempt_id=attempt_id,
            investor_id=investor_id,
        )
        return entry.entry_hash


@app.post(
    "/api/evaluate",
    response_model=EvaluateResponse,
    responses={404: {"description": "Investor or fund not found"}, 422: {"model": ConsensusRejected}},
)
def evaluate(payload: RoundtablePayload, db: Session = Depends(get_db)):
    investor = db.get(Investor, payload.investor_id)
    if investor is None:
        raise HTTPException(status_code=404, detail="Investor not found")
    if payload.fund_id is not None and db.get(Fund, payload.fund_id) is None:
        raise HTTPException(status_code=404, detail="Fund not found")

    raw_text = _combined_document_text(payload)
    raw_sha = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()

    # 1. Anti-hallucination gate: every sourceQuote must appear verbatim.
    quotes = verify_source_quotes(payload)
    figures = _extracted_figures(payload, quotes.checks)

    if not quotes.passed:
        reason = f"{len(quotes.failures)} sourceQuote(s) not found verbatim in the document text"
        attempt = VerificationAttempt(
            investor_id=investor.id,
            fund_id=payload.fund_id,
            pathway=payload.pathway,
            status=AttemptStatus.REJECTED_QUOTE_MISMATCH,
            decision=Decision.DENIED,
            extracted_figures=figures,
            raw_document_text=raw_text,
            raw_document_sha256=raw_sha,
            rejection_reason=reason,
        )
        db.add(attempt)
        db.commit()

        _write_audit(
            "verification.rejected_quote_mismatch",
            {
                "decision": Decision.DENIED.value,
                "pathway": payload.pathway.value,
                "consensusId": payload.consensus_id,
                "rawDocumentSha256": raw_sha,
                "reason": reason,
                "failedChecks": [c.model_dump(mode="json", by_alias=True) for c in quotes.failures],
            },
            attempt.id,
            investor.id,
        )
        body = ConsensusRejected(
            error=reason, verification_attempt_id=attempt.id, failed_checks=quotes.failures
        )
        return JSONResponse(status_code=422, content=body.model_dump(mode="json", by_alias=True))

    # 2. Deterministic SEC thresholds.
    evaluation = run_rules_engine(payload, investor.investor_type)
    evaluated_at = datetime.now(timezone.utc)

    attempt = VerificationAttempt(
        investor_id=investor.id,
        fund_id=payload.fund_id,
        pathway=payload.pathway,
        status=AttemptStatus.EVALUATED,
        decision=evaluation.decision,
        extracted_figures=figures,
        raw_document_text=raw_text,
        raw_document_sha256=raw_sha,
    )
    db.add(attempt)
    db.commit()

    # 3. Hash-chained audit entry for the decision.
    entry_hash = _write_audit(
        f"verification.{evaluation.decision.value}",
        {
            "decision": evaluation.decision.value,
            "pathway": payload.pathway.value,
            "investorType": investor.investor_type.value,
            "consensusId": payload.consensus_id,
            "rawDocumentSha256": raw_sha,
            "thresholds": {
                "incomeIndividual": str(INCOME_INDIVIDUAL),
                "incomeJoint": str(INCOME_JOINT),
                "netWorth": str(NET_WORTH),
            },
            "evaluation": evaluation.model_dump(mode="json", by_alias=True),
        },
        attempt.id,
        investor.id,
    )

    return EvaluateResponse(
        verification_attempt_id=attempt.id,
        status=AttemptStatus.EVALUATED,
        decision=evaluation.decision,
        evaluation=evaluation,
        quote_checks=quotes.checks,
        audit_entry_hash=entry_hash,
        evaluated_at=evaluated_at,
    )
