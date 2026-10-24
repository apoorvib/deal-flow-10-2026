# Savy backend — Task 2: FastAPI skeleton, contract-exact models, all 13 routes.
#
# /kyc and /account-links are wired to the sandbox adapter for real. Everything else
# returns contract-shaped data (static funds, placeholder evaluations/documents) —
# later tasks replace route *bodies* (AI parsing, Rule 501(a) rules engine, FINRA
# BrokerCheck automation) without touching these signatures.

import datetime
import os

from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi import status

from api import auth, store, tracing
from api import debate
from api import ingest
from api.adapters import sandbox
from api.adapters.sandbox import new_id
from api.pipeline import submit as submit_pipeline, sign_off as sign_off_pipeline
from api.models import (
    AccountLink,
    AccountLinkRequest,
    ApplicationInput,
    AuditLogEntry,
    AdminContext,
    AdminView,
    Evaluation,
    Fund,
    IncomingCheck,
    IncomingInvestor,
    Investment,
    IssuerOverview,
    KycRequest,
    KycSession,
    LicenseCheckRequest,
    LicenseCheckResponse,
    ParsedDocument,
    Passport,
    PassportEnvelope,
    PassportLookupRequest,
    PassportLookupResponse,
    ShareRequest,
    ShareView,
    User,
    Verification,
)
from api.models import Share as ShareModel

app = FastAPI(title="Savy")


@app.on_event("startup")
def startup_auth_db():
    auth.init_db()
    tracing.init_tracing()


@app.post("/auth/register")
def auth_register(body: auth.RegisterRequest, response: Response):
    return auth.register(body, response)


@app.post("/auth/login")
def auth_login(body: auth.LoginRequest, response: Response):
    return auth.login(body, response)


@app.post("/auth/link")
def auth_link(body: auth.SignInLinkRequest):
    return auth.request_sign_in(body)


@app.post("/auth/verify")
def auth_verify(body: auth.SignInVerifyRequest, response: Response):
    return auth.complete_sign_in(body, response)


@app.post("/auth/logout", status_code=204)
def auth_logout(request: Request, response: Response):
    auth.logout(request, response)
    response.status_code = 204
    return response


@app.post("/auth/signout", status_code=204)
def auth_signout(request: Request, response: Response):
    auth.logout(request, response)
    response.status_code = 204
    return response


@app.get("/me")
def auth_me(request: Request):
    return auth.current_user(request)


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
    # Pydantic's exc.errors() entries are dicts like {"loc": ("body", "legalName"),
    # "msg": "Field required", ...}. str()-ing the list sends the client a raw
    # Python repr; join the location path and message into one readable string.
    messages = []
    for err in exc.errors()[:2]:
        loc = ".".join(str(part) for part in err.get("loc", ()))
        msg = err.get("msg", "invalid value")
        messages.append(f"{loc}: {msg}" if loc else msg)
    return JSONResponse(status_code=422, content={"error": "; ".join(messages)})


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"error": str(exc)})


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _actor(user: auth.AuthUser | None = None) -> str:
    """Use the authenticated user's identity when available; otherwise record the
    honest sandbox attribution, never a fabricated reviewer name."""
    return user.email if user else (os.environ.get("REVIEWER_IDENTITY") or "unauthenticated-sandbox-signoff")


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


# --- KYC / account links (sandbox-backed, per spec) -------------------------


@app.post("/kyc")
def post_kyc(body: KycRequest, request: Request) -> KycSession:
    user = auth.current_user(request)
    session = sandbox.start_kyc(body.legal_name, body.scenario or "clean")
    store.put("kyc", session.id, session)
    auth.own("kyc", session.id, user.id)
    return session


@app.post("/account-links")
def post_account_links(body: AccountLinkRequest, request: Request) -> AccountLink:
    user = auth.current_user(request)
    link = sandbox.link_accounts(body.scenario or "high")
    store.put("links", link.id, link)
    auth.own("link", link.id, user.id)
    return link


# --- Documents ---------------------------------------------------------------


@app.post("/documents")
async def post_documents(request: Request, file: UploadFile = File(...)) -> ParsedDocument:
    user = auth.current_user(request)
    data = await file.read()
    filename = file.filename or "upload"
    text, image_b64 = ingest.ingest(data, filename, file.content_type)
    doc, review = debate.parse_upload(data, text, filename, new_id("doc"), image_b64)
    store.put("docs", doc.id, doc)
    store.put_raw("doc_reviews", doc.id, {
        "docId": review.doc_id,
        "sha256": review.sha256,
        "turns": review.turns,
        "trustAssessment": review.trust_assessment,
        "degraded": review.degraded,
        "cacheHit": review.cache_hit,
        "seconds": review.seconds,
    })
    auth.own("doc", doc.id, user.id)
    return doc


# --- Licenses (FINRA BrokerCheck automation is a later task; the CRD-prefix-9
# demo path is a non-negotiable contract detail per the design spec, so it's real now) --


@app.post("/licenses/check")
def post_license_check(body: LicenseCheckRequest) -> LicenseCheckResponse:
    from api.adapters.solari import check_license
    result = check_license(body.type, body.crd)
    return LicenseCheckResponse(found=bool(result.get("found")), name=result.get("name"))


# --- Verifications -----------------------------------------------------------


@app.post("/verifications")
def post_verifications(body: ApplicationInput, request: Request) -> Verification:
    user = auth.current_user(request)
    if body.profile.email.strip().lower() != user.email:
        raise HTTPException(403, "Use the signed-in account email for this verification.")
    for resource_type, resource_id in (("kyc", body.kyc_session_id), ("link", body.account_link_id)):
        if resource_id and auth.owner_of(resource_type, resource_id) != user.id:
            raise HTTPException(404, "Verification resource not found")
    for doc_id in body.document_ids:
        if auth.owner_of("doc", doc_id) != user.id:
            raise HTTPException(404, "Verification document not found")
    v = submit_pipeline(body)
    store.put("verifications", v.id, v)
    auth.own("verification", v.id, user.id)
    if v.passport_id:
        auth.own("passport", v.passport_id, user.id)
    return v


@app.get("/verifications/{verification_id}")
def get_verification(verification_id: str, request: Request) -> Verification:
    user = auth.current_user(request)
    v = store.get("verifications", verification_id, Verification)
    if v is None or auth.owner_of("verification", verification_id) != user.id:
        raise HTTPException(404, "Verification not found")
    return v


@app.post("/verifications/{verification_id}/sign-off")
def post_sign_off(verification_id: str, request: Request) -> Verification:
    user = auth.current_user(request)
    if user.role != "issuer":
        raise HTTPException(403, "Only an authorized issuer can sign off a review.")
    v = store.get("verifications", verification_id, Verification)
    if v is None or auth.owner_of("verification", verification_id) is None:
        raise HTTPException(404, "Verification not found")
    if v.evaluation.decision != "review":
        raise HTTPException(409, "Only cases in review can be signed off.")
    v = sign_off_pipeline(v, _actor(user))
    owner = auth.owner_of("verification", v.id)
    if v.passport_id and owner:
        auth.own("passport", v.passport_id, owner)

    # Audit trail is deliberately not part of Verification (types.ts has no
    # reviewedBy field, and that's binding) — it's a separate, append-only record
    # of who/what performed the action, kept in its own store collection.
    return v


# --- Passports ---------------------------------------------------------------


@app.get("/passports/{passport_id}")
def get_passport(passport_id: str, request: Request) -> PassportEnvelope:
    user = auth.current_user(request)
    p = store.get("passports", passport_id, Passport)
    if p is None:
        raise HTTPException(404, "Passport not found")
    auth.require_owner("passport", passport_id, user)
    active = datetime.datetime.fromisoformat(p.expires_at) > datetime.datetime.now(
        datetime.timezone.utc
    )
    return PassportEnvelope(passport=p, active=active)


@app.post("/passports/lookup")
def post_passport_lookup(body: PassportLookupRequest, request: Request) -> PassportLookupResponse | None:
    user = auth.current_user(request)
    ref = body.letter_ref.strip().upper()
    email = body.email.strip().lower()
    if email != user.email:
        return None
    for p in store.all_of("passports", Passport):
        if p.letter_ref != ref:
            continue
        v = store.get("verifications", p.verification_id, Verification)
        if v and v.input.profile.email.strip().lower() == email:
            return PassportLookupResponse(passport_id=p.id)
    return None


# --- Funds / shares -----------------------------------------------------------


@app.get("/funds")
def get_funds() -> list[Fund]:
    return FUNDS


@app.get("/passports/{passport_id}/shares")
def get_shares(passport_id: str, request: Request) -> list[ShareModel]:
    user = auth.current_user(request)
    auth.require_owner("passport", passport_id, user)
    return [s for s in store.all_of("shares", ShareModel) if s.passport_id == passport_id]


@app.post("/passports/{passport_id}/shares")
def post_share(passport_id: str, body: ShareRequest, request: Request) -> ShareModel:
    user = auth.current_user(request)
    if store.get("passports", passport_id, Passport) is None:
        raise HTTPException(404, "Passport not found")
    auth.require_owner("passport", passport_id, user)
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
    auth.own("share", share.id, user.id)
    return share


@app.delete("/passports/{passport_id}/shares/{share_id}", status_code=204)
def delete_share(passport_id: str, share_id: str, request: Request):
    user = auth.current_user(request)
    auth.require_owner("passport", passport_id, user)
    s = store.get("shares", share_id, ShareModel)
    if s is None or s.passport_id != passport_id:
        raise HTTPException(404, "Share not found")
    owner = auth.owner_of("share", share_id)
    if owner not in (None, user.id):
        raise HTTPException(404, "Share not found")
    store.delete("shares", share_id)
    if owner:
        auth.delete_owner("share", share_id)
    return None


# --- Dashboards and admin showcase ------------------------------------------

def _wire_user(user: auth.AuthUser) -> User:
    return User(
        id=user.id, name=user.name, email=user.email, role=user.role,
        passport_id=user.passport_id, fund_id=user.fund_id,
    )


def _ensure_demo_personas() -> tuple[auth.AuthUser, auth.AuthUser]:
    investor = auth.ensure_demo_user("jane@probe.invalid", "investor", "Jane Investor")
    issuer = auth.ensure_demo_user("gp@meridian.probe.invalid", "issuer",
                                   "Meridian Partners", "fund_meridian")
    owned = [p for p in store.all_of("passports", Passport)
             if auth.owner_of("passport", p.id) == investor.id]
    if not owned:
        kyc = KycSession(id=new_id("kyc"), status="verified", name_on_id="Jane Investor",
                         ofac_hit=False, pep=False, created_at=_now())
        store.put("kyc", kyc.id, kyc)
        auth.own("kyc", kyc.id, investor.id)
        inp = ApplicationInput(
            investor_type="individual",
            profile={"legalName": "Jane Investor", "email": investor.email, "country": "US"},
            kyc_session_id=kyc.id, pathway="min_investment", account_link_id=None,
            document_ids=[], min_investment={"commitment": 250000},
            attestations={"accurate": True, "notThirdPartyFinanced": True, "consentToVerify": True},
        )
        v = submit_pipeline(inp)
        store.put("verifications", v.id, v)
        auth.own("verification", v.id, investor.id)
        if v.passport_id:
            auth.own("passport", v.passport_id, investor.id)
    return investor, issuer


def _seed_investments(user: auth.AuthUser) -> list[Investment]:
    raw = store.get_raw("investments", user.id)
    if raw and raw.get("rows"):
        return [Investment.model_validate(x) for x in raw["rows"]]
    rows = [
        Investment(id="inv_%s_0" % user.id[-6:], fund_id="fund_meridian",
                    fund_name=FUNDS_BY_ID["fund_meridian"].name,
                    manager=FUNDS_BY_ID["fund_meridian"].manager, amount=100000,
                    status="committed", committed_at=_now()),
        Investment(id="inv_%s_1" % user.id[-6:], fund_id="fund_halcyon",
                    fund_name=FUNDS_BY_ID["fund_halcyon"].name,
                    manager=FUNDS_BY_ID["fund_halcyon"].manager, amount=25000,
                    status="funded", committed_at=_now()),
        Investment(id="inv_%s_2" % user.id[-6:], fund_id="fund_northbeam",
                    fund_name=FUNDS_BY_ID["fund_northbeam"].name,
                    manager=FUNDS_BY_ID["fund_northbeam"].manager, amount=15000,
                    status="closed", committed_at=_now()),
    ]
    store.put_raw("investments", user.id, {"rows": [x.model_dump(by_alias=True, mode="json") for x in rows]})
    return rows


def _seed_investor_rows() -> list[IncomingInvestor]:
    rows = [
        ("Priya Raman", "individual", "verified", "net_worth", 250000),
        ("Marcus Hale", "joint", "verified", "income", 100000),
        ("Okafor Family Trust", "entity", "review", "entity_assets", 500000),
        ("Dana Whitfield", "individual", "verified", "license", 50000),
        ("Lin Wei", "individual", "needs_info", "income", 75000),
        ("Rosen Capital LLC", "entity", "verified", "min_investment", 1000000),
        ("Tomas Ibarra", "individual", "invited", None, 50000),
        ("Hannah Cole", "individual", "expired", "net_worth", 100000),
        ("Sam Ortiz", "joint", "review", "net_worth", 150000),
        ("Grace Park", "individual", "verified", "min_investment", 200000),
        ("Elliot Brandt", "individual", "invited", None, 25000),
    ]
    out = []
    for i, (name, investor_type, status, pathway, commitment) in enumerate(rows):
        checks = [] if status == "invited" else [
            IncomingCheck(id="identity", label="Identity verified", result="pass"),
            IncomingCheck(id="sanctions", label="Sanctions and PEP screen", result="pass"),
            IncomingCheck(id="pathway", label="Verification pathway", result="warn" if status == "review" else "pass"),
            IncomingCheck(id="attest", label="Signed attestations", result="fail" if status == "needs_info" else "pass"),
        ]
        at = _now()
        out.append(IncomingInvestor(
            id="lp_seed_%s" % i, name=name,
            email="%s@probe.invalid" % name.lower().replace(" ", "."),
            investor_type=investor_type, status=status, pathway=pathway,
            verified_at=at if status in {"verified", "expired"} else None,
            expires_at=at if status in {"verified", "expired"} else None,
            letter_ref="AIV-2026-%06d" % (100000 + i) if status in {"verified", "expired"} else None,
            commitment=commitment, last_activity_at=at, checks=checks,
        ))
    return out


def _shared_investor_rows(fund_id: str) -> list[IncomingInvestor]:
    """Return only the status and outcomes a fund is allowed to see."""
    rows: dict[str, IncomingInvestor] = {}
    shares = sorted(store.all_of("shares", ShareModel), key=lambda item: item.created_at, reverse=True)
    for share in shares:
        if share.fund_id != fund_id:
            continue
        passport = store.get("passports", share.passport_id, Passport)
        if passport is None:
            continue
        verification = store.get("verifications", passport.verification_id, Verification)
        email = verification.input.profile.email.strip().lower() if verification else ""
        if not email or email in rows:
            continue
        try:
            active = datetime.datetime.fromisoformat(passport.expires_at) > datetime.datetime.now(datetime.timezone.utc)
        except ValueError:
            active = False
        commitment = (
            verification.input.min_investment.commitment
            if verification and verification.input.min_investment
            else 0
        )
        rows[email] = IncomingInvestor(
            id=f"lp_{share.id}",
            name=passport.holder_name,
            email=email,
            investor_type=passport.investor_type,
            status="verified" if active else "expired",
            pathway=passport.pathway,
            verified_at=passport.issued_at,
            expires_at=passport.expires_at,
            letter_ref=passport.letter_ref,
            commitment=commitment,
            last_activity_at=share.created_at,
            checks=[IncomingCheck(id=item.id, label=item.label, result=item.result) for item in passport.checks],
        )
    return list(rows.values())


def _admin_context(request: Request) -> AdminContext:
    admin = auth.admin_user(request)
    investor, issuer = _ensure_demo_personas()
    return AdminContext(admin=_wire_user(admin), viewing_as=auth.current_admin_view(request),
                        investor=_wire_user(investor), issuer=_wire_user(issuer))


@app.get("/me/investments")
def get_investments(request: Request) -> list[Investment]:
    user = auth.current_user(request)
    if user.role != "investor":
        raise HTTPException(403, "Investor access required.")
    return _seed_investments(user)


@app.get("/issuer/overview")
def get_issuer_overview(request: Request) -> IssuerOverview:
    user = auth.current_user(request)
    if user.role != "issuer":
        raise HTTPException(403, "Issuer access required.")
    fund = FUNDS_BY_ID[user.fund_id or "fund_meridian"]
    investors = {row.email.lower(): row for row in _seed_investor_rows()}
    investors.update({row.email.lower(): row for row in _shared_investor_rows(fund.id)})
    return IssuerOverview(
        fund=fund,
        invite_url="http://localhost:5173/get-started?fund=%s" % fund.id,
        investors=sorted(investors.values(), key=lambda row: row.last_activity_at, reverse=True),
    )


@app.post("/issuer/investors/{investor_id}/nudge", status_code=204)
def nudge_investor(investor_id: str, request: Request):
    user = auth.current_user(request)
    if user.role != "issuer":
        raise HTTPException(403, "Issuer access required.")
    store.put_raw("nudges", investor_id, {"at": _now(), "by": user.email})
    return None


@app.get("/admin/context")
def get_admin_context(request: Request) -> AdminContext:
    return _admin_context(request)


@app.post("/admin/switch")
def admin_switch(body: dict, request: Request) -> AdminContext:
    as_view = body.get("as")
    auth.switch_view(request, as_view)
    return _admin_context(request)


@app.post("/admin/cases")
def admin_create_case(body: dict, request: Request) -> Verification:
    admin = auth.admin_user(request)
    investor, _ = _ensure_demo_personas()
    decision = body.get("decision")
    if decision not in {"approved", "review", "needs_info", "denied"}:
        raise HTTPException(422, "Invalid demo decision.")
    kyc = KycSession(id=new_id("kyc"), status="verified", name_on_id="Jane Investor",
                     ofac_hit=decision == "review", pep=False, created_at=_now())
    store.put("kyc", kyc.id, kyc)
    auth.own("kyc", kyc.id, investor.id)
    inp = ApplicationInput(
        investor_type="individual",
        profile={"legalName": "Jane Investor", "email": investor.email, "country": "US"},
        kyc_session_id=kyc.id, pathway="min_investment", account_link_id=None,
        document_ids=[], min_investment={"commitment": 100000 if decision == "needs_info" else 250000},
        license=None,
        attestations={"accurate": True, "notThirdPartyFinanced": True, "consentToVerify": True},
    )
    if decision == "denied":
        inp = inp.model_copy(update={
            "pathway": "license", "min_investment": None,
            "license": {"type": "series65", "crd": "9123456"},
        })
        inp = ApplicationInput.model_validate(inp.model_dump(by_alias=True))
    v = submit_pipeline(inp)
    store.put("verifications", v.id, v)
    auth.own("verification", v.id, investor.id)
    if v.passport_id:
        auth.own("passport", v.passport_id, investor.id)
    return v


@app.post("/admin/reset")
def admin_reset(request: Request) -> AdminContext:
    auth.admin_user(request)
    for collection in ("docs", "doc_reviews", "verifications", "passports", "kyc",
                       "links", "shares", "traces", "audit_log", "investments", "nudges"):
        store.wipe(collection)
    token_hash, _, _ = auth._session_parts(request)
    with auth._connect() as db:
        db.execute("DELETE FROM app_session_views WHERE token_hash=%s", (token_hash,))
    return _admin_context(request)
