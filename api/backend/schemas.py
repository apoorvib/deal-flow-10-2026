"""Pydantic v2 API contract for the Savy backend.

Sources, in priority order:
1. src/lib/types.ts (frontend wire contract): field names, literal values, camelCase.
2. Team plan, Task 6: extracted fields shaped as {value, confidence, sourceQuote}.
3. Savy master context: Roundtable POSTs extracted figures plus the full
   rawDocumentText, and every figure carries a verbatim quote (1-50 words).

Wire format is camelCase (alias_generator=to_camel); Python stays snake_case.
Inbound payloads use extra="forbid" so unknown or misspelled fields are rejected
rather than silently dropped. A silently ignored field is an unlogged input,
which an auditor cannot reconstruct.

Money is Decimal end to end and never float, so $199,999.995 can't round across
a statutory threshold.
"""

from __future__ import annotations

import hashlib
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)
from pydantic.alias_generators import to_camel

from enums import (
    AttemptStatus,
    DebateAction,
    Decision,
    DocType,
    EntityKind,
    FailureMode,
    InvestorType,
    Offering,
    Pathway,
    Recommendation,
)

# --------------------------------------------------------------------------- #
# Thresholds (mirror src/lib/rules.ts THRESHOLDS; the rules engine imports these)
# --------------------------------------------------------------------------- #

INCOME_INDIVIDUAL = Decimal("200000")
INCOME_JOINT = Decimal("300000")
NET_WORTH = Decimal("1000000")
MIN_INVESTMENT_INDIVIDUAL = Decimal("200000")
MIN_INVESTMENT_ENTITY = Decimal("1000000")
ENTITY_ASSETS = Decimal("5000000")
FRESHNESS_DAYS = 90
PASSPORT_VALIDITY_DAYS = 90
REVIEW_CONFIDENCE = 0.9

# Quote-length bounds. Relaxed from the original 5-10 words to 1-50 so short
# verbatim figures (e.g. "$185,000.00", as in the team plan) are accepted. The
# exact substring match is the real anti-hallucination control.
QUOTE_MIN_WORDS = 1
QUOTE_MAX_WORDS = 50

# Memory guard for the 512M container: ~50 pages of dense tax text is well
# under 2M characters. Bigger payloads are rejected before any work is done.
MAX_RAW_DOCUMENT_CHARS = 2_000_000
MAX_DOCUMENTS_PER_PAYLOAD = 20

_MONEY_MAX = Decimal("9999999999999.99")  # fits Numeric(15, 2)


# --------------------------------------------------------------------------- #
# Base classes
# --------------------------------------------------------------------------- #


class WireModel(BaseModel):
    """Outbound and frontend-facing models: camelCase on the wire."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        use_enum_values=False,
        ser_json_inf_nan="strings",
    )


class InboundModel(WireModel):
    """Untrusted inbound payloads: strict, immutable, no unknown fields."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        frozen=True,
        str_strip_whitespace=False,  # never mutate quotes: the match must be verbatim
    )


# --------------------------------------------------------------------------- #
# Reusable constrained types
# --------------------------------------------------------------------------- #


def _two_places(v: Decimal) -> Decimal:
    if v != v.quantize(Decimal("0.01")):
        raise ValueError("money must have at most 2 decimal places")
    return v


Money = Annotated[
    Decimal,
    Field(ge=Decimal("0"), le=_MONEY_MAX, allow_inf_nan=False),
    AfterValidator(_two_places),
]
"""A non-negative dollar amount with cents precision."""

Confidence = Annotated[float, Field(ge=0.0, le=1.0, allow_inf_nan=False)]
TaxYear = Annotated[int, Field(ge=1990, le=2100)]
NonEmptyStr = Annotated[str, StringConstraints(min_length=1, max_length=255)]
Sha256Hex = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
CountryCode = Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")]

_WORD_RE = re.compile(r"\S+")


def _validate_quote(v: str) -> str:
    if v != v.strip():
        raise ValueError("sourceQuote must not have leading or trailing whitespace")
    words = len(_WORD_RE.findall(v))
    if not QUOTE_MIN_WORDS <= words <= QUOTE_MAX_WORDS:
        raise ValueError(
            f"sourceQuote must be {QUOTE_MIN_WORDS}-{QUOTE_MAX_WORDS} words, got {words}"
        )
    return v


SourceQuote = Annotated[str, StringConstraints(min_length=1, max_length=1000), AfterValidator(_validate_quote)]
"""Verbatim 1-50 word excerpt of the source document. Checked by exact substring
match against rawDocumentText: no normalisation, no case folding, no fuzzy matching."""


# --------------------------------------------------------------------------- #
# Roundtable inbound payload (POST /roundtable/consensus)
# --------------------------------------------------------------------------- #
# One payload = one investor's whole document set after the 4-round debate
# (extract -> challenge -> respond -> adjudicate). It's per-set, not per-document,
# because cross_document_inconsistency can only be judged across the set.


class ExtractedMoney(InboundModel):
    """A dollar figure plus the verbatim evidence for it (team plan Task 6 shape)."""

    value: Money
    confidence: Confidence
    source_quote: SourceQuote


class ExtractedYear(InboundModel):
    value: TaxYear
    confidence: Confidence
    source_quote: SourceQuote


class ExtractedDate(InboundModel):
    value: date
    confidence: Confidence
    source_quote: SourceQuote


class ExtractedText(InboundModel):
    value: NonEmptyStr
    confidence: Confidence
    source_quote: SourceQuote


class ExtractedFields(InboundModel):
    """The fields ParsedDocument needs. The extractor must omit any field the
    document doesn't state rather than guess, so every field is optional and
    absent means "not stated". `income` is AGI, or W-2 wages when there is no AGI."""

    income: ExtractedMoney | None = None
    balance: ExtractedMoney | None = None
    holder_name: ExtractedText | None = None
    tax_year: ExtractedYear | None = None
    statement_date: ExtractedDate | None = None

    def present(self) -> dict[str, ExtractedMoney | ExtractedYear | ExtractedDate | ExtractedText]:
        """Fields actually provided, keyed by camelCase wire name (used in audit logs)."""
        return {
            to_camel(name): field
            for name in type(self).model_fields
            if (field := getattr(self, name)) is not None
        }


class DebateChallenge(InboundModel):
    """Round 2: one challenge from the (different-vendor) challenger model."""

    field_name: Literal["income", "balance", "holderName", "taxYear", "statementDate"]
    failure_mode: FailureMode
    reason: Annotated[str, StringConstraints(min_length=1, max_length=2000)]


class DebateResolution(InboundModel):
    """Round 3: the extractor concedes (with a revised value) or defends."""

    field_name: Literal["income", "balance", "holderName", "taxYear", "statementDate"]
    action: DebateAction
    revised_value: Decimal | int | str | None = None
    justification: Annotated[str, StringConstraints(min_length=1, max_length=2000)]

    @model_validator(mode="after")
    def _concede_needs_value(self) -> DebateResolution:
        if self.action is DebateAction.CONCEDE and self.revised_value is None:
            raise ValueError("CONCEDE requires revisedValue")
        if self.action is DebateAction.DEFEND and self.revised_value is not None:
            raise ValueError("DEFEND must not carry revisedValue")
        return self


class ModelAttribution(InboundModel):
    """Which model played which role: part of the "reasonable steps" record."""

    extractor: NonEmptyStr
    challenger: NonEmptyStr
    adjudicator: NonEmptyStr

    @model_validator(mode="after")
    def _cross_vendor(self) -> ModelAttribution:
        # Same vendor twice shares blind spots and turns the review into a rubber stamp.
        if self.extractor.split("/")[0] == self.challenger.split("/")[0]:
            raise ValueError("challenger must be a different vendor than the extractor")
        return self


class RoundtableDocument(InboundModel):
    """One document's consensus result plus the full text it was read from."""

    document_id: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    file_name: NonEmptyStr
    doc_type: DocType
    raw_document_text: Annotated[
        str, StringConstraints(min_length=1, max_length=MAX_RAW_DOCUMENT_CHARS)
    ]
    # Optional: if Roundtable sends it, it must match the text we received.
    raw_document_sha256: Sha256Hex | None = None
    fields: ExtractedFields
    confidence: Confidence
    flags: list[Annotated[str, StringConstraints(min_length=1, max_length=500)]] = Field(
        default_factory=list, max_length=50
    )
    summary: Annotated[str, StringConstraints(min_length=1, max_length=1000)]
    challenges: list[DebateChallenge] = Field(default_factory=list, max_length=50)
    resolutions: list[DebateResolution] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def _integrity(self) -> RoundtableDocument:
        if self.raw_document_sha256 is not None and self.raw_document_sha256 != self.text_sha256:
            raise ValueError("rawDocumentSha256 does not match rawDocumentText")
        challenged = {c.field_name for c in self.challenges}
        for r in self.resolutions:
            if r.field_name not in challenged:
                raise ValueError(f"resolution for unchallenged field {r.field_name!r}")
        return self

    @property
    def text_sha256(self) -> str:
        return hashlib.sha256(self.raw_document_text.encode("utf-8")).hexdigest()


class RoundtablePayload(InboundModel):
    """What Roundtable POSTs to us once consensus is reached.

    Schema validation is only step one. The service layer then runs the strict
    substring check (verify_source_quotes) and rejects the whole payload if any
    sourceQuote isn't found verbatim in its document's rawDocumentText.
    """

    schema_version: Literal["1.0"] = "1.0"
    consensus_id: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    investor_id: UUID
    fund_id: UUID | None = None
    pathway: Pathway
    models: ModelAttribution
    recommendation: Recommendation
    reached_at: datetime
    documents: list[RoundtableDocument] = Field(min_length=1, max_length=MAX_DOCUMENTS_PER_PAYLOAD)

    @field_validator("reached_at")
    @classmethod
    def _tz_aware(cls, v: datetime) -> datetime:
        if v.tzinfo is None or v.utcoffset() is None:
            raise ValueError("reachedAt must include a timezone offset")
        return v

    @model_validator(mode="after")
    def _unique_documents(self) -> RoundtablePayload:
        ids = [d.document_id for d in self.documents]
        if len(ids) != len(set(ids)):
            raise ValueError("documentId values must be unique within a payload")
        return self


# --------------------------------------------------------------------------- #
# Anti-hallucination: strict sourceQuote substring verification
# --------------------------------------------------------------------------- #


class QuoteCheck(WireModel):
    """Result of checking one sourceQuote. Stored in extracted_figures JSONB and audit logs."""

    document_id: str
    field: str
    value: str
    source_quote: str
    found: bool


class QuoteVerificationResult(WireModel):
    passed: bool
    checks: list[QuoteCheck]

    @property
    def failures(self) -> list[QuoteCheck]:
        return [c for c in self.checks if not c.found]


def verify_source_quotes(payload: RoundtablePayload) -> QuoteVerificationResult:
    """Deterministic check that every sourceQuote appears verbatim in its own document.

    Plain `in` (exact, case-sensitive, whitespace-sensitive). Each quote is only
    checked against the document it claims to come from, so a figure can't borrow
    a quote from another document in the set. Every field is checked (no short
    circuit), so the audit log records every failure, not just the first.
    """
    checks: list[QuoteCheck] = []
    for doc in payload.documents:
        for field_name, extracted in doc.fields.present().items():
            checks.append(
                QuoteCheck(
                    document_id=doc.document_id,
                    field=field_name,
                    value=str(extracted.value),
                    source_quote=extracted.source_quote,
                    found=extracted.source_quote in doc.raw_document_text,
                )
            )
    return QuoteVerificationResult(passed=all(c.found for c in checks), checks=checks)


# --------------------------------------------------------------------------- #
# Outbound: Roundtable consensus responses
# --------------------------------------------------------------------------- #


class ConsensusAccepted(WireModel):
    """202 response: the quotes verified and the attempt was persisted."""

    verification_attempt_id: UUID
    status: Literal[AttemptStatus.RECEIVED, AttemptStatus.EVALUATED]
    quote_checks: list[QuoteCheck]
    received_at: datetime


class ConsensusRejected(WireModel):
    """422 response: at least one sourceQuote isn't in the document.

    Keeps the frontend's {"error": ...} shape and adds the attempt id and failed
    checks, so Roundtable can tie the rejection to the immutable audit entry.
    """

    error: str
    verification_attempt_id: UUID
    failed_checks: list[QuoteCheck]


# --------------------------------------------------------------------------- #
# Outbound: frontend entities (mirror src/lib/types.ts exactly)
# --------------------------------------------------------------------------- #


class ParsedDocument(WireModel):
    """types.ts ParsedDocument. Numbers are emitted as JSON numbers, not strings."""

    id: str
    file_name: str
    doc_type: DocType
    holder_name: str | None
    tax_year: int | None
    statement_date: str | None
    income: float | None
    balance: float | None
    confidence: Confidence
    flags: list[str]
    summary: str
    created_at: str

    @classmethod
    def from_roundtable(cls, doc: RoundtableDocument, created_at: datetime) -> ParsedDocument:
        f = doc.fields
        return cls(
            id=doc.document_id,
            file_name=doc.file_name,
            doc_type=doc.doc_type,
            holder_name=f.holder_name.value if f.holder_name else None,
            tax_year=f.tax_year.value if f.tax_year else None,
            statement_date=f.statement_date.value.isoformat() if f.statement_date else None,
            income=float(f.income.value) if f.income else None,
            balance=float(f.balance.value) if f.balance else None,
            confidence=doc.confidence,
            flags=list(doc.flags),
            summary=doc.summary,
            created_at=created_at.isoformat(),
        )


CheckResult = Literal["pass", "fail", "warn"]


class Check(WireModel):
    id: str
    label: str
    result: CheckResult
    detail: str


class Evaluation(WireModel):
    decision: Decision
    checks: list[Check]
    reasons: list[str]


class FundOut(WireModel):
    """types.ts Fund. `closing` is a string because the frontend allows "Rolling"."""

    id: str
    name: str
    manager: str
    strategy: str
    offering: Offering
    min_check: float
    closing: str


class InvestorOut(WireModel):
    id: UUID
    legal_name: str
    email: str
    country: str
    investor_type: InvestorType
    entity_name: str | None
    entity_kind: EntityKind | None
    created_at: datetime


class VerificationAttemptOut(WireModel):
    """Read model for an attempt. raw_document_text is never exposed over the API."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    id: UUID
    investor_id: UUID
    fund_id: UUID | None
    pathway: Pathway
    status: AttemptStatus
    decision: Decision | None
    extracted_figures: dict
    raw_document_sha256: str
    rejection_reason: str | None
    reviewed_by: str | None
    reviewed_at: datetime | None
    created_at: datetime


class AuditLogOut(WireModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    id: int
    verification_attempt_id: UUID | None
    investor_id: UUID | None
    event_type: str
    actor: str
    payload: dict
    prev_hash: str | None
    entry_hash: str
    created_at: datetime


class ErrorResponse(BaseModel):
    """The frontend's error shape: {"error": "message"}."""

    error: str
