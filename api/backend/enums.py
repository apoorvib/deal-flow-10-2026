"""Shared enums. Values mirror src/lib/types.ts exactly; never rename a value.

Lives in its own module so schemas.py (and its tests) can import enums without
importing models.py, which connects to the database and loads the encryption key.
"""

import enum


class Offering(str, enum.Enum):
    RULE_506C = "506(c)"
    RULE_506B = "506(b)"


class InvestorType(str, enum.Enum):
    INDIVIDUAL = "individual"
    JOINT = "joint"
    ENTITY = "entity"


class EntityKind(str, enum.Enum):
    LLC = "llc"
    CORPORATION = "corporation"
    PARTNERSHIP = "partnership"
    TRUST = "trust"


class Pathway(str, enum.Enum):
    INCOME = "income"
    NET_WORTH = "net_worth"
    LICENSE = "license"
    MIN_INVESTMENT = "min_investment"
    ENTITY_ASSETS = "entity_assets"


class AttemptStatus(str, enum.Enum):
    RECEIVED = "received"
    REJECTED_QUOTE_MISMATCH = "rejected_quote_mismatch"
    EVALUATED = "evaluated"


class Decision(str, enum.Enum):
    APPROVED = "approved"
    REVIEW = "review"
    NEEDS_INFO = "needs_info"
    DENIED = "denied"


class DocType(str, enum.Enum):
    W2 = "w2"
    FORM_1040 = "form_1040"
    K1 = "k1"
    BANK_STATEMENT = "bank_statement"
    BROKERAGE_STATEMENT = "brokerage_statement"
    CPA_LETTER = "cpa_letter"
    TRUST_AGREEMENT = "trust_agreement"
    ENTITY_FORMATION = "entity_formation"
    OTHER = "other"


class Recommendation(str, enum.Enum):
    """The adjudicator's recommendation. An input to the rules engine, never the decision."""

    APPROVE = "APPROVE"
    DENY = "DENY"
    INSUFFICIENT = "INSUFFICIENT"


class FailureMode(str, enum.Enum):
    """Named failure modes the challenger model uses (team spec §4.1)."""

    MISREAD_OR_TRANSPOSED_DIGITS = "misread_or_transposed_digits"
    WRONG_FIELD = "wrong_field"
    STALE_OR_WRONG_TAX_YEAR = "stale_or_wrong_tax_year"
    CROSS_DOCUMENT_INCONSISTENCY = "cross_document_inconsistency"
    FACE_ARITHMETIC_ERROR = "face_arithmetic_error"
    IMPOSSIBLE_DATES = "impossible_dates"
    UNSUPPORTED_INFERENCE = "unsupported_inference"
    SIGNS_OF_ALTERATION = "signs_of_alteration"


class DebateAction(str, enum.Enum):
    CONCEDE = "CONCEDE"
    DEFEND = "DEFEND"
