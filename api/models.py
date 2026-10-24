# Mirrors src/lib/types.ts field-for-field. That file is authoritative — do not rename,
# add, or drop a field here without checking it there first.
#
# Wire format is camelCase (alias_generator=to_camel). populate_by_name=True lets later
# tasks' tests construct models with snake_case kwargs (e.g. Profile(legal_name=...)).

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class Base(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# --- Literal unions (exact values from types.ts) ---------------------------

InvestorType = Literal["individual", "joint", "entity"]
EntityKind = Literal["llc", "corporation", "partnership", "trust"]
Pathway = Literal[
    "income", "net_worth", "license", "min_investment", "entity_assets",
    "all_owners_accredited", "registered_adviser",
]
LicenseType = Literal["series7", "series65", "series82"]
DocType = Literal[
    "w2",
    "form_1040",
    "k1",
    "bank_statement",
    "brokerage_statement",
    "cpa_letter",
    "trust_agreement",
    "entity_formation",
    "other",
]
CheckResult = Literal["pass", "fail", "warn"]
Decision = Literal["approved", "review", "needs_info", "denied"]

KycStatus = Literal["verified", "failed"]
AccountKind = Literal["checking", "savings", "brokerage", "retirement"]
Offering = Literal["506(c)", "506(b)"]
Role = Literal["investor", "issuer", "admin"]
InvestmentStatus = Literal["committed", "funded", "closed"]
IncomingStatus = Literal["verified", "review", "needs_info", "expired", "invited"]
AdminView = Literal["admin", "investor", "issuer", "visitor"]


# --- Models (order matches types.ts) ----------------------------------------


class Profile(Base):
    legal_name: str
    email: str
    country: str
    entity_name: Optional[str] = None
    entity_kind: Optional[EntityKind] = None


class KycSession(Base):
    """Result of the identity / sanctions check (Persona in production, mocked for now)."""

    id: str
    status: KycStatus
    name_on_id: str
    ofac_hit: bool
    pep: bool
    created_at: str


class LinkedAccount(Base):
    id: str
    institution: str
    name: str
    kind: AccountKind
    balance: float


class AccountLink(Base):
    """Account-link session (Plaid in production, mocked for now)."""

    id: str
    accounts: List[LinkedAccount]
    created_at: str


class ParsedDocument(Base):
    """What the AI layer extracted from an uploaded document. The server keeps these;
    the client only references them by id."""

    id: str
    file_name: str
    doc_type: DocType
    holder_name: Optional[str]
    tax_year: Optional[int]
    statement_date: Optional[str]
    income: Optional[float]
    balance: Optional[float]
    confidence: float
    flags: List[str]
    summary: str
    created_at: str


class IncomeEvidence(Base):
    prior_year2: float
    prior_year1: float
    expected_current: float


class NetWorthEvidence(Base):
    other_assets: float
    liabilities: float
    primary_residence_value: float
    primary_residence_mortgage: float
    mortgage_increase_last60_days: float


class LicenseEvidence(Base):
    type: LicenseType
    crd: str


class MinInvestmentEvidence(Base):
    commitment: float


class EntityAssetsEvidence(Base):
    total_assets: float
    formed_for_purpose: bool


class OwnersEvidence(Base):
    owner_count: int
    all_accredited: bool


class AdviserEvidence(Base):
    file_number: str


class Attestations(Base):
    accurate: bool
    not_third_party_financed: bool
    consent_to_verify: bool


class ApplicationInput(Base):
    """What the LP submits. Server-side facts (KYC, linked accounts, parsed docs) are
    referenced by id, never trusted from the client."""

    investor_type: InvestorType
    profile: Profile
    kyc_session_id: Optional[str]
    pathway: Pathway
    account_link_id: Optional[str]
    document_ids: List[str]
    income: Optional[IncomeEvidence] = None
    net_worth: Optional[NetWorthEvidence] = None
    license: Optional[LicenseEvidence] = None
    min_investment: Optional[MinInvestmentEvidence] = None
    entity_assets: Optional[EntityAssetsEvidence] = None
    owners: Optional[OwnersEvidence] = None
    adviser: Optional[AdviserEvidence] = None
    attestations: Attestations
    invite_token: Optional[str] = None


class Check(Base):
    id: str
    label: str
    result: CheckResult
    detail: str


class Evaluation(Base):
    decision: Decision
    checks: List[Check]
    reasons: List[str]


class Verification(Base):
    id: str
    input: ApplicationInput
    evaluation: Evaluation
    passport_id: Optional[str]
    created_at: str
    reviewed_at: Optional[str]


class Passport(Base):
    id: str
    holder_name: str
    investor_type: InvestorType
    pathway: Pathway
    verification_id: str
    letter_ref: str
    issued_at: str
    expires_at: str
    checks: List[Check]


class Fund(Base):
    id: str
    name: str
    manager: str
    strategy: str
    offering: Offering
    min_check: float
    closing: str


class ShareView(Base):
    at: str
    by: str


class Share(Base):
    id: str
    passport_id: str
    fund_id: str
    created_at: str
    views: List[ShareView]


class User(Base):
    id: str
    name: str
    email: str
    role: Role
    passport_id: Optional[str] = None
    fund_id: Optional[str] = None


class Investment(Base):
    id: str
    fund_id: str
    fund_name: str
    manager: str
    amount: float
    status: InvestmentStatus
    committed_at: str


class IncomingCheck(Base):
    id: str
    label: str
    result: CheckResult


class IncomingInvestor(Base):
    id: str
    name: str
    email: str
    investor_type: InvestorType
    status: IncomingStatus
    pathway: Optional[Pathway]
    verified_at: Optional[str]
    expires_at: Optional[str]
    letter_ref: Optional[str]
    commitment: float
    last_activity_at: str
    checks: List[IncomingCheck]


class IssuerOverview(Base):
    fund: Fund
    invite_url: str
    investors: List[IncomingInvestor]


class AdminContext(Base):
    admin: User
    viewing_as: AdminView
    investor: User
    issuer: User


class InviteRequest(Base):
    email: str
    name: Optional[str] = None
    commitment: Optional[float] = None


class Invite(Base):
    id: str
    fund_id: str
    email: str
    name: Optional[str] = None
    commitment: Optional[float] = None
    status: Literal["sent", "opened", "accepted"]
    sent_at: str


class InviteView(Base):
    fund: Fund
    inviter_name: str
    email: str
    name: Optional[str] = None
    has_account: bool


class InviteAcceptance(Base):
    user: User
    outcome: Literal["shared", "confirm", "verify"]
    passport_id: Optional[str] = None
    fund: Fund


class UserSettings(Base):
    name: str
    email: str
    notifications: dict[str, bool]
    auto_share_on_invite: bool


class FundingAccount(Base):
    id: str
    institution: str
    name: str
    last4: str
    is_default: bool
    connected_at: str


IntegrationId = Literal["carta", "angellist", "affinity", "junipersquare"]


class Integration(Base):
    id: IntegrationId
    connected: bool
    connected_at: Optional[str] = None
    push_cleared: bool
    import_contacts: bool


class QuoteRequest(Base):
    name: str
    email: str
    company: str
    volume: str
    notes: Optional[str] = None


# --- Request/response shapes not in types.ts but needed by the routes ------
# (bodies/returns the client sends/expects per client.ts; not wire *entities*.)


class KycRequest(Base):
    legal_name: str
    scenario: Optional[Literal["clean", "ofac", "fail"]] = "clean"


class AccountLinkRequest(Base):
    scenario: Optional[Literal["high", "low"]] = "high"


class LicenseCheckRequest(Base):
    type: LicenseType
    crd: str


class LicenseCheckResponse(Base):
    found: bool
    name: Optional[str]


class PassportLookupRequest(Base):
    email: str
    letter_ref: str


class PassportLookupResponse(Base):
    passport_id: str


class PassportEnvelope(Base):
    passport: Passport
    active: bool


class ShareRequest(Base):
    fund_id: str


class AuditLogEntry(Base):
    """A durable record of a state-changing action on a verification, independent of
    the Verification record itself (so the audit trail survives even if the
    verification is later overwritten). Kept flat and span-shaped on purpose: a
    later task adding PRISM tracing should be able to emit this as a span's
    attributes without reshaping it — `at` as the span timestamp, `action` as the
    span name, everything else as attributes.
    """

    id: str
    verification_id: str
    action: str
    at: str
    decision_before: Decision
    decision_after: Decision
    actor: str
    request_source: Optional[str] = None
    user_agent: Optional[str] = None
