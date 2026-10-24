"""Submission pipeline: deterministic checks + case-level AI review -> decision -> passport.

The AI never writes `decision` (A1). Passports are only issued through
`issue_passport`, which runs the guardrail first (A18).
"""

from __future__ import annotations

import datetime

from api import debate, store
from api.adapters import akta, solari
from api.adapters.sandbox import new_id
from api.checks import run_checks
from api.decide import assert_issue_guardrail, conflict_check, decide, detect_conflict
from api.models import (AccountLink, ApplicationInput, Check, Evaluation, KycSession, ParsedDocument,
                        Passport, Verification)

PASSPORT_DAYS = 90


def now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _name_key(n: str | None) -> str:
    return " ".join((n or "").lower().replace(",", " ").split())


def evaluate(inp: ApplicationInput) -> tuple[Evaluation, dict]:
    """Returns (evaluation, trace). trace is server-side only."""
    kyc = store.get("kyc", inp.kyc_session_id, KycSession) if inp.kyc_session_id else None
    link = store.get("links", inp.account_link_id, AccountLink) if inp.account_link_id else None
    docs = [d for d in (store.get("docs", i, ParsedDocument) for i in inp.document_ids) if d]
    evidence: dict = {}
    trace: dict = {}

    if inp.pathway == "license" and inp.license:
        lic = solari.check_license(inp.license.type, inp.license.crd)
        evidence["license"] = {**lic, "type": inp.license.type}
        trace["license"] = lic
    if inp.investor_type == "entity" and inp.profile.entity_name:
        ent = akta.corroborate_entity(inp.profile.entity_name)
        evidence["entity"] = ent
        trace["entity"] = ent

    case = {"crossDocumentIssues": [], "recommendation": None, "degraded": True}
    if docs:
        self_reported = {k: v for k, v in {
            "income": inp.income.model_dump(by_alias=True) if inp.income else None,
            "netWorth": inp.net_worth.model_dump(by_alias=True) if inp.net_worth else None,
        }.items() if v}
        case = debate.review_case(docs, inp.pathway, inp.investor_type, self_reported)
        evidence["cross_document"] = case.get("crossDocumentIssues") or []
    trace["case_review"] = case

    checks: list[Check] = run_checks(inp, docs, kyc, link, evidence)

    # Holder-name check: every named document should belong to the ID-verified person
    # (or the entity). A mismatch is a reviewer question, not an automatic denial.
    if kyc and kyc.status == "verified":
        allowed = {_name_key(kyc.name_on_id), _name_key(inp.profile.legal_name), _name_key(inp.profile.entity_name)}
        if inp.license and evidence.get("license", {}).get("found") and evidence["license"].get("name"):
            bc = _name_key(evidence["license"]["name"])
            if bc not in ("registered representative",) and not (set(bc.split()) & set(_name_key(kyc.name_on_id).split())):
                checks.insert(-1, Check(id="license_name", label="BrokerCheck name matches ID", result="warn",
                                        detail=f"BrokerCheck lists {evidence['license']['name']}; ID shows {kyc.name_on_id}."))
        foreign = []
        for d in docs:
            h = _name_key(d.holder_name)
            # Same surname as the ID / profile / entity name counts as a match (A23).
            if h and not any(h == a or h.split()[-1] == a.split()[-1] for a in allowed if a):
                foreign.append(f"{d.file_name} is in the name of {d.holder_name}")
        if foreign:
            checks.insert(-1, Check(id="holder_name", label="Documents belong to the applicant", result="warn",
                                    detail="; ".join(foreign) + "."))

    rec = case.get("recommendation")
    if detect_conflict(rec, checks):
        checks.insert(-1, conflict_check(rec, checks))
    ev = decide(checks, inp.pathway)
    return ev, trace


def issue_passport(v: Verification) -> Passport:
    assert_issue_guardrail(v)
    t = datetime.datetime.now(datetime.timezone.utc)
    holder = (v.input.profile.entity_name or v.input.profile.legal_name) if v.input.investor_type == "entity" \
        else v.input.profile.legal_name
    p = Passport(id=new_id("pp"), holder_name=holder, investor_type=v.input.investor_type, pathway=v.input.pathway,
                 verification_id=v.id, letter_ref=f"AIV-{t.year}-{v.id[-6:].upper()}", issued_at=t.isoformat(),
                 expires_at=(t + datetime.timedelta(days=PASSPORT_DAYS)).isoformat(), checks=v.evaluation.checks)
    store.put("passports", p.id, p)
    v.passport_id = p.id
    return p


def submit(inp: ApplicationInput) -> Verification:
    ev, trace = evaluate(inp)
    v = Verification(id=new_id("ver"), input=inp, evaluation=ev, passport_id=None, created_at=now(), reviewed_at=None)
    if ev.decision == "approved":
        issue_passport(v)
    store.put("verifications", v.id, v)
    store.put_raw("traces", v.id, {"verificationId": v.id, "at": v.created_at, **trace})
    return v


def sign_off(v: Verification, actor: str) -> Verification:
    before = v.evaluation.decision
    v.evaluation = Evaluation(decision="approved", checks=v.evaluation.checks, reasons=[])
    v.reviewed_at = now()
    issue_passport(v)
    store.put("verifications", v.id, v)
    store.put_raw("audit_log", new_id("audit"), {"verificationId": v.id, "action": "sign_off", "at": v.reviewed_at,
                                                 "decisionBefore": before, "decisionAfter": "approved", "actor": actor})
    return v
