"""Decision engine: escalation over checks, agent/validator conflict, issue guardrail.

The AI never writes `decision`. See assumptions.md A1, A16-A18.
"""

from __future__ import annotations

from api.models import Check, Evaluation, Verification

RANK = {"approved": 0, "review": 1, "needs_info": 2, "denied": 3}

# fail on these is fixable by the LP -> needs_info (mirrors fakeEvaluate)
_FIXABLE = {"identity", "sanctions", "attest"}
# informational warns that do not escalate (fakeEvaluate passes no escalation for these)
_NON_ESCALATING = {"liabilities"}

_REASONS = {
    "identity": "Complete the ID check.",
    "sanctions": "We’re confirming your sanctions screen.",
    "attest": "Sign the accuracy statement and consent to verify.",
    "assets_verified": "We’re confirming the self-reported part of your net worth.",
    "trust": "We’re confirming the trust’s grantor and trustees.",
    "income_cross_check": "Your reported income doesn’t match your tax documents; a reviewer will confirm.",
    "cross_document": "Your documents don’t agree with each other; a reviewer will confirm.",
    "entity_corroboration": "We’re confirming the entity’s operating details.",
    "agent_validator_conflict": "Automated reviewers disagreed; a human reviewer will confirm.",
}

CONFLICT_ID = "agent_validator_conflict"


def _escalation(c: Check, pathway_fail_needs_info: bool) -> str:
    if c.result == "pass" or (c.result == "warn" and c.id in _NON_ESCALATING):
        return "approved"
    if c.result == "warn":
        return "review"
    if c.id in _FIXABLE or c.id.startswith("income_2") or c.id.startswith("income_1"):
        return "needs_info"
    if c.id == "pathway":
        return "needs_info" if pathway_fail_needs_info else "denied"
    return "needs_info"


def _reason(c: Check) -> str:
    if c.id in _REASONS:
        return _REASONS[c.id]
    if c.id.startswith("doc_"):
        return f"We’re double-checking {c.label}."
    if c.id.startswith("income_") and c.result == "fail":
        return f"Upload a W-2, 1040, or K-1 for {c.id.split('_')[1]}."
    if c.id == "pathway":
        return c.detail
    return c.detail


def decide(checks: list[Check], pathway: str | None = None) -> Evaluation:
    decision = "approved"
    reasons: list[str] = []
    for c in checks:
        esc = _escalation(c, pathway == "min_investment")
        if RANK[esc] > RANK[decision]:
            decision = esc
        if esc != "approved":
            r = _reason(c)
            if r not in reasons:
                reasons.append(r)
    return Evaluation(decision=decision, checks=checks, reasons=[] if decision == "approved" else reasons)


def detect_conflict(recommendation: str | None, checks: list[Check]) -> bool:
    """Agents' case-level recommendation vs the deterministic layer (A4)."""
    if recommendation not in ("APPROVE", "DENY"):
        return False
    hard_fail = any(c.result == "fail" for c in checks)
    any_issue = any(c.result in ("fail", "warn") and c.id not in _NON_ESCALATING for c in checks)
    if recommendation == "APPROVE":
        return hard_fail or any(c.id in ("income_cross_check", "cross_document") and c.result == "warn" for c in checks)
    return not any_issue  # DENY while every check passes


def conflict_check(recommendation: str, checks: list[Check]) -> Check:
    failing = [c.label for c in checks if c.result in ("fail", "warn") and c.id not in _NON_ESCALATING]
    if recommendation == "APPROVE":
        detail = (f"AI reviewers recommended APPROVE, but the deterministic validator flagged: "
                  f"{', '.join(failing)}. Held for human review.")
    else:
        detail = "AI reviewers recommended DENY, but every deterministic check passed. Held for human review."
    return Check(id=CONFLICT_ID, label="AI reviewers agree with validator", result="warn", detail=detail)


class GuardrailViolation(AssertionError):
    pass


def assert_issue_guardrail(v: Verification) -> None:
    """Never issue a passport while any check fails, or while an agent/validator
    conflict is unresolved (unresolved = not yet signed off by a human). A18."""
    checks = v.evaluation.checks
    failed = [c.id for c in checks if c.result == "fail"]
    if failed:
        raise GuardrailViolation(f"Refusing to issue passport for {v.id}: failed checks {failed}")
    if any(c.id == CONFLICT_ID for c in checks) and v.reviewed_at is None:
        raise GuardrailViolation(f"Refusing to issue passport for {v.id}: unresolved agent/validator conflict")
    if v.evaluation.decision != "approved":
        raise GuardrailViolation(f"Refusing to issue passport for {v.id}: decision is {v.evaluation.decision}")
