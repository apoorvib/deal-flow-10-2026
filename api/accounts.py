"""Accounts, sessions, dashboards and the admin showcase, stored in the JSON store.

Follows the frontend contract (src/lib/api/client.ts): passwordless sign-in links
(POST /auth/link -> devToken, POST /auth/verify sets the session cookie), GET /me
(401 when signed out), POST /auth/signout. Replaces the Postgres design in auth.py,
which the UI never calls (A24).
"""

from __future__ import annotations

import datetime
import hashlib
import os
import secrets
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import Field

from api import pipeline, store
from api.adapters.sandbox import new_id, start_kyc
from api.models import (ApplicationInput, Attestations, Base, Fund, KycSession, LicenseEvidence,
                        MinInvestmentEvidence, Passport, Profile, Share, ShareView, Verification)

Role = Literal["investor", "issuer", "admin"]
AdminView = Literal["admin", "investor", "issuer", "visitor"]
COOKIE = "savy_session"
SESSION_DAYS = 14
ISSUER_FUND_ID = "fund_meridian"
DEMO_INVESTOR_EMAIL = "jane@probe.invalid"
DEMO_ISSUER_EMAIL = "gp@meridian.probe.invalid"
# Admin sign-in is limited to these emails (comma-separated). Empty = any email may
# request an admin link, which is acceptable only for the hackathon sandbox.
ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}
DEV_TOKENS = os.getenv("DEV_SIGNIN_TOKENS", "1") == "1"

router = APIRouter()


class User(Base):
    id: str
    name: str
    email: str
    role: Role
    passport_id: Optional[str] = None
    fund_id: Optional[str] = None


class LinkRequest(Base):
    email: str
    role: Role = "investor"


class VerifyRequest(Base):
    token: str


class SwitchRequest(Base):
    view: AdminView = Field(alias="as")


class CaseRequest(Base):
    decision: Literal["approved", "review", "needs_info", "denied"]


class Investment(Base):
    id: str
    fund_id: str
    fund_name: str
    manager: str
    amount: float
    status: Literal["committed", "funded", "closed"]
    committed_at: str


class IncomingCheck(Base):
    id: str
    label: str
    result: Literal["pass", "fail", "warn"]


class IncomingInvestor(Base):
    id: str
    name: str
    email: str
    investor_type: str
    status: Literal["verified", "review", "needs_info", "expired", "invited"]
    pathway: Optional[str]
    verified_at: Optional[str]
    expires_at: Optional[str]
    letter_ref: Optional[str]
    commitment: float
    last_activity_at: str
    checks: list[IncomingCheck]


class IssuerOverview(Base):
    fund: Fund
    invite_url: str
    investors: list[IncomingInvestor]


class AdminContext(Base):
    admin: User
    viewing_as: AdminView
    investor: User
    issuer: User


def _utc() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _iso(days_ago: float = 0) -> str:
    return (_utc() - datetime.timedelta(days=days_ago)).isoformat()


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _title(email: str) -> str:
    import re
    parts = [w for w in re.split(r"[._-]+", email.split("@")[0]) if w]
    return " ".join(w[0].upper() + w[1:] for w in parts) or "Investor"


# --- users & sessions ---------------------------------------------------------------


def _users() -> list[User]:
    return [User.model_validate(u) for u in store.all_raw("users").values()]


def _get_user(uid: str | None) -> User | None:
    raw = store.get_raw("users", uid) if uid else None
    return User.model_validate(raw) if raw else None


def _save_user(u: User) -> None:
    store.put_raw("users", u.id, u.model_dump(by_alias=True, mode="json"))


def upsert_user(email: str, role: str, name: str | None = None) -> User:
    email = email.strip().lower()
    for u in _users():
        if u.email == email and u.role == role:
            return u
    if name is None:
        name = "Meridian Partners" if role == "issuer" else f"{_title(email)} (admin)" if role == "admin" else _title(email)
    u = User(id=new_id("usr"), name=name, email=email, role=role,
             fund_id=ISSUER_FUND_ID if role == "issuer" else None)
    _save_user(u)
    return u


def passport_for(email: str) -> Passport | None:
    email = email.lower()
    best = None
    for p in store.all_of("passports", Passport):
        v = store.get("verifications", p.verification_id, Verification)
        if v and v.input.profile.email.strip().lower() == email and (best is None or p.issued_at > best.issued_at):
            best = p
    return best


def link_passport(u: User) -> User:
    if u.role == "investor":
        p = passport_for(u.email)
        u.passport_id = p.id if p else None
        if p and p.investor_type != "entity":
            u.name = p.holder_name
    return u


def _session(request: Request) -> tuple[str, dict] | None:
    raw = request.cookies.get(COOKIE)
    if not raw:
        return None
    key = _hash(raw)
    s = store.get_raw("sessions", key)
    if not s or s["expiresAt"] < _utc().isoformat():
        return None
    return key, s


def optional_user(request: Request) -> User | None:
    s = _session(request)
    if not s:
        return None
    u = _get_user(s[1].get("userId"))
    return link_passport(u) if u else None


def current_user(request: Request) -> User:
    u = optional_user(request)
    if u is None:
        raise HTTPException(401, "Sign in to continue.")
    return u


def _admin(request: Request) -> tuple[str, dict, User]:
    s = _session(request)
    if not s:
        raise HTTPException(401, "Sign in to continue.")
    admin = _get_user(s[1].get("adminId"))
    if not admin or admin.role != "admin":
        raise HTTPException(403, "Staff only.")
    return s[0], s[1], admin


def _set_cookie(response: Response, raw: str) -> None:
    response.set_cookie(COOKIE, raw, max_age=SESSION_DAYS * 86400, path="/", httponly=True,
                        secure=os.getenv("COOKIE_SECURE", "0") == "1", samesite="lax")


# --- ownership (who may list/revoke shares) -------------------------------------------


def own(kind: str, rid: str | None, uid: str | None) -> None:
    if rid and uid:
        store.put_raw("ownership", f"{kind}:{rid}", {"userId": uid})


def owner_of(kind: str, rid: str) -> str | None:
    r = store.get_raw("ownership", f"{kind}:{rid}")
    return r["userId"] if r else None


# --- auth routes --------------------------------------------------------------------


@router.post("/auth/link")
def auth_link(body: LinkRequest):
    email = body.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(422, "Enter a valid email.")
    if body.role == "admin" and ADMIN_EMAILS and email not in ADMIN_EMAILS:
        raise HTTPException(403, "That email isn't on the staff list.")
    token = secrets.token_urlsafe(24)
    store.put_raw("signin_links", _hash(token), {"email": email, "role": body.role,
                                                 "expiresAt": (_utc() + datetime.timedelta(minutes=30)).isoformat()})
    # No mail provider is wired in the sandbox; the token comes back so the UI can follow it (A25).
    return {"sent": True, **({"devToken": token} if DEV_TOKENS else {})}


@router.post("/auth/verify")
def auth_verify(body: VerifyRequest, response: Response):
    key = _hash(body.token)
    link = store.get_raw("signin_links", key)
    if not link or link["expiresAt"] < _utc().isoformat():
        raise HTTPException(404, "Sign-in link not found or expired.")
    store.delete("signin_links", key)
    u = link_passport(upsert_user(link["email"], link["role"]))
    raw = secrets.token_urlsafe(32)
    store.put_raw("sessions", _hash(raw), {
        "userId": u.id, "adminId": u.id if u.role == "admin" else None, "adminView": "admin",
        "expiresAt": (_utc() + datetime.timedelta(days=SESSION_DAYS)).isoformat()})
    _set_cookie(response, raw)
    return u


@router.get("/me")
def me(request: Request):
    return current_user(request)


@router.post("/auth/signout")
def signout(request: Request, response: Response):
    s = _session(request)
    if s:
        store.delete("sessions", s[0])
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


# --- reference data -----------------------------------------------------------------

FUNDS: list[Fund] = [
    Fund(id="fund_meridian", name="Meridian Seed Fund II", manager="Meridian Partners",
         strategy="Pre-seed and seed, B2B software", offering="506(c)", min_check=25_000, closing="2026-12-15"),
    Fund(id="fund_halcyon", name="Halcyon Grid Storage SPV", manager="Halcyon Collective",
         strategy="Single-asset SPV, utility-scale storage", offering="506(c)", min_check=10_000, closing="2026-11-08"),
    Fund(id="fund_northbeam", name="Northbeam Rolling Fund", manager="Northbeam Capital",
         strategy="Quarterly rolling fund, fintech infrastructure", offering="506(c)", min_check=5_000, closing="Rolling"),
    Fund(id="fund_quarry", name="Quarry Street Residential III", manager="Quarry Street Capital",
         strategy="Multifamily value-add, Sun Belt", offering="506(c)", min_check=50_000, closing="2027-01-31"),
    Fund(id="fund_lattice", name="Lattice Bio Opportunities", manager="Lattice Ventures",
         strategy="Seed-stage therapeutics", offering="506(b)", min_check=100_000, closing="2027-02-28"),
]
FUNDS_BY_ID = {f.id: f for f in FUNDS}


# --- investor dashboard -------------------------------------------------------------


def _seed_investments(uid: str) -> list[dict]:
    rows = [("fund_meridian", 100_000, "committed", 3), ("fund_halcyon", 25_000, "funded", 21),
            ("fund_northbeam", 15_000, "closed", 64)]
    return [Investment(id=f"inv_{uid[-6:]}_{i}", fund_id=f, fund_name=FUNDS_BY_ID[f].name,
                       manager=FUNDS_BY_ID[f].manager, amount=a, status=st, committed_at=_iso(d)
                       ).model_dump(by_alias=True, mode="json") for i, (f, a, st, d) in enumerate(rows)]


def investments_of(u: User) -> list[dict]:
    rec = store.get_raw("investments", u.id)
    if rec is None:
        rec = {"items": _seed_investments(u.id)}
        store.put_raw("investments", u.id, rec)
    return rec["items"]


@router.get("/me/investments")
def my_investments(request: Request):
    u = current_user(request)
    if u.role != "investor" or not u.passport_id:
        return []
    return investments_of(u)


# --- issuer dashboard ---------------------------------------------------------------

SEED_LPS = [
    ("Priya Raman", "individual", "verified", "net_worth", 250_000, 2),
    ("Marcus Hale", "joint", "verified", "income", 100_000, 5),
    ("Okafor Family Trust", "entity", "review", "entity_assets", 500_000, 0),
    ("Dana Whitfield", "individual", "verified", "license", 50_000, 9),
    ("Lin Wei", "individual", "needs_info", "income", 75_000, 1),
    ("Rosen Capital LLC", "entity", "verified", "min_investment", 1_000_000, 12),
    ("Tomás Ibarra", "individual", "invited", None, 50_000, 4),
    ("Hannah Cole", "individual", "expired", "net_worth", 100_000, 96),
    ("Sam Ortiz", "joint", "review", "net_worth", 150_000, 0),
    ("Grace Park", "individual", "verified", "min_investment", 200_000, 15),
    ("Elliot Brandt", "individual", "invited", None, 25_000, 2),
]
CHECK_LABELS = {"net_worth": "Net worth test", "income": "Income test", "license": "License test",
                "min_investment": "Minimum investment", "entity_assets": "Entity assets test"}


def _b36(n: int) -> str:
    digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = digits[r] + out
    return out or "0"


def _seeded(i: int, row: tuple) -> IncomingInvestor:
    import re
    name, itype, status, pathway, commitment, days = row
    verified_at = _iso(days) if pathway and status != "invited" else None
    expires_at = (datetime.datetime.fromisoformat(verified_at) + datetime.timedelta(days=90)).isoformat() if verified_at else None
    pending = status in ("review", "needs_info")
    checks = [] if status == "invited" else [
        IncomingCheck(id="identity", label="Identity verified", result="pass"),
        IncomingCheck(id="sanctions", label="Sanctions and PEP screen", result="pass"),
        IncomingCheck(id="pathway", label=CHECK_LABELS[pathway], result="warn" if pending else "pass"),
        *([IncomingCheck(id="lookthrough", label="Entity look-through", result="warn" if status == "review" else "pass")]
          if itype == "entity" else []),
        IncomingCheck(id="attest", label="Signed attestations", result="fail" if status == "needs_info" else "pass"),
    ]
    lid = f"lp_seed_{i}"
    shown = status in ("verified", "expired")
    nudged = store.get_raw("nudges", lid)
    return IncomingInvestor(
        id=lid, name=name, email=re.sub(r"[^a-z]+", ".", name.lower()) + "@probe.invalid", investor_type=itype,
        status=status, pathway=pathway, verified_at=verified_at if shown else None,
        expires_at=expires_at if shown else None,
        letter_ref=f"AIV-2026-{_b36(0x3A7F1 + i * 7919)[-6:]}" if shown else None,
        commitment=commitment, last_activity_at=nudged["at"] if nudged else _iso(min(days, 3) + i / 24), checks=checks)


def _shared(fund_id: str) -> list[IncomingInvestor]:
    out: dict[str, IncomingInvestor] = {}
    for sh in sorted(store.all_of("shares", Share), key=lambda s: s.created_at, reverse=True):
        if sh.fund_id != fund_id:
            continue
        p = store.get("passports", sh.passport_id, Passport)
        if not p:
            continue
        v = store.get("verifications", p.verification_id, Verification)
        email = v.input.profile.email.lower() if v else ""
        if email in out:
            continue  # one row per investor, most recent share
        commitment = 0.0
        for u in _users():
            if u.role == "investor" and u.email == email:
                commitment = next((i["amount"] for i in investments_of(u) if i["fundId"] == fund_id), 0.0)
        if not commitment and v and v.input.min_investment:
            commitment = v.input.min_investment.commitment
        active = datetime.datetime.fromisoformat(p.expires_at) > _utc()
        out[email] = IncomingInvestor(
            id=f"lp_{sh.id}", name=p.holder_name, email=email, investor_type=p.investor_type,
            status="verified" if active else "expired", pathway=p.pathway, verified_at=p.issued_at,
            expires_at=p.expires_at, letter_ref=p.letter_ref, commitment=commitment, last_activity_at=sh.created_at,
            # Status and outcomes only: no balances, income or net worth leave this endpoint.
            checks=[IncomingCheck(id=c.id, label=c.label, result=c.result) for c in p.checks])
    return list(out.values())


@router.get("/issuer/overview")
def issuer_overview(request: Request):
    u = current_user(request)
    if u.role != "issuer":
        raise HTTPException(403, "Fund accounts only.")
    fund = FUNDS_BY_ID[u.fund_id or ISSUER_FUND_ID]
    investors = _shared(fund.id) + [_seeded(i, r) for i, r in enumerate(SEED_LPS)]
    investors.sort(key=lambda x: x.last_activity_at, reverse=True)
    origin = request.headers.get("origin") or os.getenv("APP_ORIGIN", "http://localhost:5173")
    return IssuerOverview(fund=fund, invite_url=f"{origin}/get-started?fund={fund.id}", investors=investors)


@router.post("/issuer/investors/{investor_id}/nudge")
def nudge(investor_id: str, request: Request):
    u = current_user(request)
    if u.role != "issuer":
        raise HTTPException(403, "Fund accounts only.")
    store.put_raw("nudges", investor_id, {"at": _utc().isoformat(), "by": u.id})
    return {"ok": True}


# --- admin showcase -----------------------------------------------------------------


def _demo_input(kyc_id: str, decision: str) -> ApplicationInput:
    base = dict(investor_type="individual",
                profile=Profile(legal_name="Jane Investor", email=DEMO_INVESTOR_EMAIL, country="United States"),
                kyc_session_id=kyc_id, pathway="min_investment", account_link_id=None, document_ids=[],
                min_investment=MinInvestmentEvidence(commitment=250_000),
                attestations=Attestations(accurate=True, not_third_party_financed=True, consent_to_verify=True))
    if decision == "needs_info":
        base["min_investment"] = MinInvestmentEvidence(commitment=100_000)
    elif decision == "denied":
        base.update(pathway="license", min_investment=None, license=LicenseEvidence(type="series65", crd="9123456"))
    return ApplicationInput(**base)


def create_case(decision: str) -> Verification:
    """Runs a demo application through the real pipeline (same checks, same guardrail)."""
    kyc = start_kyc("Jane Investor", "ofac" if decision == "review" else "clean")
    store.put("kyc", kyc.id, kyc)
    return pipeline.submit(_demo_input(kyc.id, decision))


def ensure_personas() -> tuple[User, User]:
    investor = upsert_user(DEMO_INVESTOR_EMAIL, "investor", "Jane Investor")
    if passport_for(DEMO_INVESTOR_EMAIL) is None:
        create_case("approved")
    link_passport(investor)
    investments_of(investor)
    pid = investor.passport_id
    if pid and not any(s.passport_id == pid and s.fund_id == ISSUER_FUND_ID for s in store.all_of("shares", Share)):
        at = _utc().isoformat()
        sh = Share(id=new_id("shr"), passport_id=pid, fund_id=ISSUER_FUND_ID, created_at=at,
                   views=[ShareView(at=at, by="Meridian Partners compliance")])
        store.put("shares", sh.id, sh)
        own("share", sh.id, investor.id)
    own("passport", pid, investor.id)
    issuer = upsert_user(DEMO_ISSUER_EMAIL, "issuer", "Meridian Partners")
    return investor, issuer


def _ctx(admin: User, view: str) -> AdminContext:
    investor, issuer = ensure_personas()
    return AdminContext(admin=admin, viewing_as=view, investor=investor, issuer=issuer)


@router.get("/admin/context")
def admin_context(request: Request):
    _, s, admin = _admin(request)
    return _ctx(admin, s.get("adminView", "admin"))


@router.post("/admin/switch")
def admin_switch(body: SwitchRequest, request: Request):
    key, s, admin = _admin(request)
    ctx = _ctx(admin, body.view)
    target = {"admin": admin.id, "investor": ctx.investor.id, "issuer": ctx.issuer.id, "visitor": None}[body.view]
    store.put_raw("sessions", key, {**s, "userId": target, "adminView": body.view})
    return ctx


@router.post("/admin/cases")
def admin_cases(body: CaseRequest, request: Request):
    _admin(request)
    return create_case(body.decision)


DEMO_COLLECTIONS = ["kyc", "links", "docs", "verifications", "passports", "shares", "investments", "nudges",
                    "ownership", "signin_links", "traces", "audit_log", "doc_reviews"]


@router.post("/admin/reset")
def admin_reset(request: Request):
    key, s, admin = _admin(request)
    for c in DEMO_COLLECTIONS:
        store.wipe(c)
    sessions = {key: {**s, "userId": admin.id, "adminView": "admin"}}
    store.wipe("sessions")
    store.wipe("users")
    _save_user(admin)
    store.put_raw("sessions", key, sessions[key])
    return _ctx(admin, "admin")
