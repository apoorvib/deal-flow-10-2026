# Savy backend — Task 2: FastAPI skeleton, contract-exact models, all 13 routes.
#
# /kyc and /account-links are wired to the sandbox adapter for real. Everything else
# returns contract-shaped data (static funds, placeholder evaluations/documents) —
# later tasks replace route *bodies* (AI parsing, Rule 501(a) rules engine, FINRA
# BrokerCheck automation) without touching these signatures.

import datetime

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api import store
from api.adapters import sandbox
from api.adapters.sandbox import new_id
from api.models import (
    AccountLink,
    AccountLinkRequest,
    ApplicationInput,
    Check,
    Evaluation,
    Fund,
    KycRequest,
    KycSession,
    LicenseCheckRequest,
    LicenseCheckResponse,
    ParsedDocument,
    Passport,
    PassportEnvelope,
    PassportLookupRequest,
    ShareRequest,
    ShareView,
    Verification,
)
from api.models import Share as ShareModel

app = FastAPI(title="Savy")

# Wildcard origins are rejected by browsers when credentials are included, and the
# frontend sends credentials: 'include' on every request (see src/lib/api/client.ts).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


# Static reference data (spec: funds are not user-created in this slice).
FUNDS: list[Fund] = [
    Fund(id="fund_meridian", name="Meridian Seed Fund II", manager="Meridian Partners",
         strategy="Pre-seed and seed, B2B software", offering="506(c)", min_check=25_000,
         closing="2026-12-15"),
    Fund(id="fund_halcyon", name="Halcyon Grid Storage SPV", manager="Halcyon Collective",
         strategy="Single-asset SPV, utility-scale storage", offering="506(c)", min_check=10_000,
         closing="2026-11-08"),
    Fund(id="fund_northbeam", name="Northbeam Rolling Fund", manager="Northbeam Capital",
         strategy="Quarterly rolling fund, fintech infrastructure", offering="506(c)",
         min_check=5_000, closing="Rolling"),
    Fund(id="fund_quarry", name="Quarry Street Residential III", manager="Quarry Street Capital",
         strategy="Multifamily value-add, Sun Belt", offering="506(c)", min_check=50_000,
         closing="2027-01-31"),
    Fund(id="fund_lattice", name="Lattice Bio Opportunities", manager="Lattice Ventures",
         strategy="Seed-stage therapeutics", offering="506(b)", min_check=100_000,
         closing="2027-02-28"),
]
FUNDS_BY_ID = {f.id: f for f in FUNDS}


def _issue_passport(v: Verification) -> Passport:
    now = datetime.datetime.now(datetime.timezone.utc)
    holder = (
        v.input.profile.entity_name or v.input.profile.legal_name
        if v.input.investor_type == "entity"
        else v.input.profile.legal_name
    )
    p = Passport(
        id=new_id("pp"),
        holder_name=holder,
        investor_type=v.input.investor_type,
        pathway=v.input.pathway,
        verification_id=v.id,
        letter_ref=f"AIV-{now.year}-{v.id[-6:].upper()}",
        issued_at=now.isoformat(),
        expires_at=(now + datetime.timedelta(days=90)).isoformat(),
        checks=v.evaluation.checks,
    )
    store.put("passports", p.id, p)
    v.passport_id = p.id
    return p


# --- KYC / account links (sandbox-backed, per spec) -------------------------


@app.post("/kyc")
def post_kyc(body: KycRequest) -> KycSession:
    session = sandbox.start_kyc(body.legal_name, body.scenario or "clean")
    store.put("kyc", session.id, session)
    return session


@app.post("/account-links")
def post_account_links(body: AccountLinkRequest) -> AccountLink:
    link = sandbox.link_accounts(body.scenario or "high")
    store.put("links", link.id, link)
    return link


# --- Documents (AI parsing is a later task) ---------------------------------


@app.post("/documents")
async def post_documents(file: UploadFile = File(...)) -> ParsedDocument:
    doc = ParsedDocument(
        id=new_id("doc"),
        file_name=file.filename or "upload",
        doc_type="other",
        holder_name=None,
        tax_year=None,
        statement_date=None,
        income=None,
        balance=None,
        confidence=0.5,
        flags=[],
        summary="Awaiting AI review.",
        created_at=_now(),
    )
    store.put("docs", doc.id, doc)
    return doc


# --- Licenses (FINRA BrokerCheck automation is a later task; the CRD-prefix-9
# demo path is a non-negotiable contract detail per the design spec, so it's real now) --


@app.post("/licenses/check")
def post_license_check(body: LicenseCheckRequest) -> LicenseCheckResponse:
    found, name = sandbox.check_license(body.crd)
    return LicenseCheckResponse(found=found, name=name)


# --- Verifications (rules engine is a later task) ---------------------------


@app.post("/verifications")
def post_verifications(body: ApplicationInput) -> Verification:
    evaluation = Evaluation(
        decision="review",
        checks=[],
        reasons=["Automated evaluation isn't implemented yet; routed for manual review."],
    )
    v = Verification(
        id=new_id("ver"),
        input=body,
        evaluation=evaluation,
        passport_id=None,
        created_at=_now(),
        reviewed_at=None,
    )
    store.put("verifications", v.id, v)
    return v


@app.get("/verifications/{verification_id}")
def get_verification(verification_id: str) -> Verification:
    v = store.get("verifications", verification_id, Verification)
    if v is None:
        raise HTTPException(404, "Verification not found")
    return v


@app.post("/verifications/{verification_id}/sign-off")
def post_sign_off(verification_id: str) -> Verification:
    v = store.get("verifications", verification_id, Verification)
    if v is None:
        raise HTTPException(404, "Verification not found")
    if v.evaluation.decision != "review":
        raise HTTPException(409, "Only cases in review can be signed off.")
    v.evaluation = Evaluation(decision="approved", checks=v.evaluation.checks, reasons=[])
    v.reviewed_at = _now()
    _issue_passport(v)
    store.put("verifications", v.id, v)
    return v


# --- Passports ---------------------------------------------------------------


@app.get("/passports/{passport_id}")
def get_passport(passport_id: str) -> PassportEnvelope:
    p = store.get("passports", passport_id, Passport)
    if p is None:
        raise HTTPException(404, "Passport not found")
    active = datetime.datetime.fromisoformat(p.expires_at) > datetime.datetime.now(
        datetime.timezone.utc
    )
    return PassportEnvelope(passport=p, active=active)


@app.post("/passports/lookup")
def post_passport_lookup(body: PassportLookupRequest):
    ref = body.letter_ref.strip().upper()
    email = body.email.strip().lower()
    for p in store.all_of("passports", Passport):
        if p.letter_ref != ref:
            continue
        v = store.get("verifications", p.verification_id, Verification)
        if v and v.input.profile.email.strip().lower() == email:
            return {"passportId": p.id}
    return None


# --- Funds / shares -----------------------------------------------------------


@app.get("/funds")
def get_funds() -> list[Fund]:
    return FUNDS


@app.get("/passports/{passport_id}/shares")
def get_shares(passport_id: str) -> list[ShareModel]:
    return [s for s in store.all_of("shares", ShareModel) if s.passport_id == passport_id]


@app.post("/passports/{passport_id}/shares")
def post_share(passport_id: str, body: ShareRequest) -> ShareModel:
    if store.get("passports", passport_id, Passport) is None:
        raise HTTPException(404, "Passport not found")
    fund = FUNDS_BY_ID.get(body.fund_id)
    if fund is None:
        raise HTTPException(404, "Fund not found")
    for s in store.all_of("shares", ShareModel):
        if s.passport_id == passport_id and s.fund_id == body.fund_id:
            return s
    now = _now()
    share = ShareModel(
        id=new_id("shr"),
        passport_id=passport_id,
        fund_id=body.fund_id,
        created_at=now,
        views=[ShareView(at=now, by=f"{fund.manager} compliance")],
    )
    store.put("shares", share.id, share)
    return share


@app.delete("/passports/{passport_id}/shares/{share_id}", status_code=204)
def delete_share(passport_id: str, share_id: str):
    s = store.get("shares", share_id, ShareModel)
    if s is None or s.passport_id != passport_id:
        raise HTTPException(404, "Share not found")
    store.delete("shares", share_id)
    return None
