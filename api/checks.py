"""Deterministic Rule 501(a) checks. Pure functions; no model calls.

Mirrors fakeEvaluate() in src/lib/api/mock.ts (same check ids/labels), plus
income_cross_check, cross_document, entity_corroboration. See assumptions.md A12-A16.
"""

from __future__ import annotations

import datetime

from api.models import AccountLink, ApplicationInput, Check, KycSession, ParsedDocument

THRESHOLDS = {
    "income_individual": 200_000,
    "income_joint": 300_000,
    "net_worth": 1_000_000,
    "min_investment_individual": 200_000,
    "min_investment_entity": 1_000_000,
    "entity_assets": 5_000_000,
    "review_confidence": 0.9,
}

INCOME_DOC_TYPES = {"w2", "form_1040", "k1"}


def usd(n: float) -> str:
    return f"${n:,.0f}"


def estimate_net_worth(verified_assets, other_assets, liabilities, primary_residence_value,
                       primary_residence_mortgage, mortgage_increase_last_60_days) -> dict:
    """Verbatim port of estimateNetWorth() in src/lib/rules.ts."""
    underwater = max(0, primary_residence_mortgage - primary_residence_value)
    recent = min(mortgage_increase_last_60_days, primary_residence_mortgage)
    assets = verified_assets + other_assets
    total_liabilities = liabilities + max(underwater, recent)
    return {"assets": assets, "liabilities": total_liabilities, "net_worth": assets - total_liabilities}


def documented_income(docs: list[ParsedDocument], year: int) -> float | None:
    """A13: 1040 AGI for the year if present, else the sum of W-2/K-1 income."""
    year_docs = [d for d in docs if d.tax_year == year and d.income is not None]
    agi = [d.income for d in year_docs if d.doc_type == "form_1040"]
    if agi:
        return max(agi)
    wages = [d.income for d in year_docs if d.doc_type in ("w2", "k1")]
    return sum(wages) if wages else None


def material_gap(reported: float, documented: float) -> bool:
    """A14: overstatement by more than 5% or $5,000, whichever is larger."""
    return reported - documented > max(0.05 * documented, 5_000)


def run_checks(inp: ApplicationInput, docs: list[ParsedDocument], kyc: KycSession | None,
               link: AccountLink | None, evidence: dict) -> list[Check]:
    checks: list[Check] = []

    def add(cid: str, label: str, result: str, detail: str) -> None:
        checks.append(Check(id=cid, label=label, result=result, detail=detail))

    # Identity + sanctions
    if kyc is None or kyc.status != "verified":
        add("identity", "Identity verified", "fail", "ID check incomplete.")
    else:
        add("identity", "Identity verified", "pass", f"Government ID matched to {kyc.name_on_id}.")
        if kyc.ofac_hit or kyc.pep:
            add("sanctions", "Sanctions and PEP screen", "warn", "Possible OFAC or PEP list match.")
        else:
            add("sanctions", "Sanctions and PEP screen", "pass", "No OFAC or PEP matches.")

    # Per-document AI review outcome
    for d in docs:
        if d.confidence < THRESHOLDS["review_confidence"] or d.flags:
            add(f"doc_{d.id}", d.file_name, "warn",
                "; ".join(d.flags) if d.flags else f"Low extraction confidence ({d.confidence:.2f}).")
        else:
            add(f"doc_{d.id}", d.file_name, "pass", d.summary)

    t = inp.investor_type
    pw = inp.pathway

    if pw == "income":
        _income(inp, docs, add)
    elif pw == "net_worth":
        _net_worth(inp, docs, link, add)
    elif pw == "license":
        lic = evidence.get("license") or {}
        ltype = (lic.get("type") or (inp.license.type if inp.license else "")).replace("series", "Series ")
        crd = inp.license.crd if inp.license else lic.get("crd", "")
        if lic.get("found"):
            src = " (cached lookup)" if lic.get("cache_hit") else ""
            add("pathway", "License test", "pass",
                f"Active {ltype} on FINRA BrokerCheck{src} — Rule 501(a)(10).")
        else:
            add("pathway", "License test", "fail",
                f"No active license for CRD {crd} on FINRA BrokerCheck — Rule 501(a)(10).")
    elif pw == "min_investment":
        th = THRESHOLDS["min_investment_entity" if t == "entity" else "min_investment_individual"]
        commit = inp.min_investment.commitment if inp.min_investment else 0
        if commit < th:
            add("pathway", "Minimum investment", "fail",
                f"{usd(commit)} is below {usd(th)} — SEC no-action letter (Mar 2025).")
        elif not inp.attestations.not_third_party_financed:
            add("pathway", "Minimum investment", "fail",
                "Missing certification that funds are not third-party financed.")
        else:
            add("pathway", "Minimum investment", "pass",
                f"{usd(commit)} commitment, not third-party financed — SEC no-action letter (Mar 2025).")
    elif pw == "entity_assets":
        ea = inp.entity_assets
        total = ea.total_assets if ea else 0
        if total <= THRESHOLDS["entity_assets"]:
            add("pathway", "Entity assets test", "fail", f"{usd(total)} is at or below $5M — Rule 501(a)(3)/(9).")
        elif ea.formed_for_purpose:
            add("pathway", "Entity assets test", "warn",
                "Formed for this investment; owners need look-through — Rule 501(a)(3)/(9).")
        else:
            add("pathway", "Entity assets test", "pass", f"{usd(total)} in total assets — Rule 501(a)(3)/(9).")
    elif pw == "all_owners_accredited":
        owners = inp.owners
        if not owners or owners.owner_count < 1 or not owners.all_accredited:
            add("pathway", "Accredited owners test", "fail",
                "Every equity owner must be accredited — Rule 501(a)(8).")
        else:
            add("pathway", "Accredited owners test", "pass",
                f"All {owners.owner_count} equity owners are represented as accredited — Rule 501(a)(8).")
    elif pw == "registered_adviser":
        adviser = evidence.get("adviser") or {}
        if adviser.get("found"):
            add("pathway", "Registered adviser test", "pass",
                "Adviser registration found on the SEC/IAPD lookup — Rule 501(a)(1).")
        else:
            add("pathway", "Registered adviser test", "fail",
                "No registered or exempt reporting adviser found for that file number — Rule 501(a)(1).")

    if t == "entity":
        ent = evidence.get("entity")
        if ent is not None:
            if ent.get("resolved") and not ent.get("adverse_news"):
                add("entity_corroboration", "Entity corroboration", "pass",
                    "Entity resolves to an operating business (akta.pro corroboration, not accreditation).")
            else:
                why = "could not be resolved to an operating business" if not ent.get("resolved") \
                    else f"{len(ent['adverse_news'])} adverse news item(s)"
                add("entity_corroboration", "Entity corroboration", "warn",
                    f"Entity {why} (akta.pro corroboration only; does not verify accreditation).")
        if inp.profile.entity_kind == "trust":
            add("trust", "Trust look-through", "warn", "Grantor and trustees are being confirmed.")

    # Case-level cross-document review (A5)
    cross = evidence.get("cross_document") or []
    if cross:
        add("cross_document", "Documents consistent with each other", "warn", "; ".join(cross))

    att = inp.attestations
    add("attest", "Signed attestations", "pass" if att.accurate and att.consent_to_verify else "fail",
        "Accuracy statement and consent to verify.")
    return checks


def _income(inp, docs, add) -> None:
    th = THRESHOLDS["income_joint" if inp.investor_type == "joint" else "income_individual"]
    inc = inp.income
    if not inc or inc.prior_year1 < th or inc.prior_year2 < th or inc.expected_current < th:
        add("pathway", "Income test", "fail",
            f"Self-reported income below {usd(th)} in at least one year — Rule 501(a)(6) requires each of the last two years.")
    else:
        add("pathway", "Income test", "pass",
            f"Self-reported income above {usd(th)} in each of the last two years and expected this year — Rule 501(a)(6).")

    y = datetime.date.today().year
    years = {d.tax_year for d in docs if d.tax_year and d.doc_type in INCOME_DOC_TYPES}
    for yr in (y - 2, y - 1):
        if yr in years:
            add(f"income_{yr}", f"{yr} income documented", "pass", f"Tax document provided for {yr}.")
        else:
            add(f"income_{yr}", f"{yr} income documented", "fail", f"No tax document for {yr}.")

    if not inc:
        return
    reported = {y - 2: inc.prior_year2, y - 1: inc.prior_year1}
    gaps, compared = [], []
    for yr, rep in reported.items():
        doc_amt = documented_income(docs, yr)
        if doc_amt is None:
            continue
        compared.append(yr)
        if material_gap(rep, doc_amt):
            below = " — below the threshold" if doc_amt < th else ""
            gaps.append(f"{yr}: self-reported {usd(rep)}, documents show {usd(doc_amt)}{below}")
    if gaps:
        add("income_cross_check", "Self-reported income matches documents", "warn",
            "Contradiction — " + "; ".join(gaps) + ".")
    elif compared:
        add("income_cross_check", "Self-reported income matches documents", "pass",
            f"Self-reported figures match the documents for {', '.join(map(str, compared))}.")


def _net_worth(inp, docs, link, add) -> None:
    nw = inp.net_worth
    linked = sum(a.balance for a in link.accounts) if link else 0
    stmt = sum(d.balance or 0 for d in docs)
    r = estimate_net_worth(linked + stmt, nw.other_assets if nw else 0, nw.liabilities if nw else 0,
                           nw.primary_residence_value if nw else 0, nw.primary_residence_mortgage if nw else 0,
                           nw.mortgage_increase_last60_days if nw else 0)
    if r["net_worth"] < THRESHOLDS["net_worth"]:
        add("pathway", "Net worth test", "fail",
            f"{usd(r['net_worth'])} is below $1,000,000, excluding primary residence — Rule 501(a)(5).")
        return
    add("pathway", "Net worth test", "pass",
        f"{usd(r['assets'])} assets − {usd(r['liabilities'])} liabilities = {usd(r['net_worth'])} — Rule 501(a)(5).")
    if linked + stmt - r["liabilities"] >= THRESHOLDS["net_worth"]:
        add("assets_verified", "Assets independently confirmed", "pass",
            f"{usd(linked + stmt)} confirmed via linked accounts and statements.")
    else:
        add("assets_verified", "Assets independently confirmed", "warn",
            f"Only {usd(linked + stmt)} confirmed; the rest is self-reported.")
    add("liabilities", "Liabilities", "warn", "Self-reported until credit data is connected.")
