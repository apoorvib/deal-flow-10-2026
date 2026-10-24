# Persona (KYC) and Plaid (account linking) are deliberately stubbed, not integrated —
# see types.ts comments ("mocked for now") and spec §4.6. These are deterministic
# stand-ins that honor the `scenario` sandbox parameter exactly like src/lib/api/mock.ts.

import datetime
import uuid

from api.models import AccountLink, KycSession, LinkedAccount


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:14]}"


def start_kyc(legal_name: str, scenario: str = "clean") -> KycSession:
    return KycSession(
        id=new_id("kyc"),
        status="failed" if scenario == "fail" else "verified",
        name_on_id=legal_name,
        ofac_hit=scenario == "ofac",
        pep=False,
        created_at=_now(),
    )


def link_accounts(scenario: str = "high") -> AccountLink:
    k = 1.0 if scenario == "high" else 0.2
    return AccountLink(
        id=new_id("link"),
        created_at=_now(),
        accounts=[
            LinkedAccount(
                id="a1",
                institution="Chase",
                name="Total Checking •• 4417",
                kind="checking",
                balance=round(84_250 * k),
            ),
            LinkedAccount(
                id="a2",
                institution="Fidelity",
                name="Individual Brokerage •• 2093",
                kind="brokerage",
                balance=round(1_142_900 * k),
            ),
            LinkedAccount(
                id="a3",
                institution="Vanguard",
                name="Rollover IRA •• 7781",
                kind="retirement",
                balance=round(318_400 * k),
            ),
        ],
    )


def check_license(crd: str) -> tuple[bool, str | None]:
    """Sandbox demo path (spec §2, non-negotiable): a CRD beginning with '9' is the
    UI's documented license-failure case. Real FINRA BrokerCheck automation is a
    later task."""
    if crd.startswith("9"):
        return False, None
    return True, "Registered representative"


def check_adviser(file_number: str) -> tuple[bool, str | None]:
    """Deterministic IAPD stand-in until a production adviser connector is selected."""
    if file_number.strip().startswith("9"):
        return False, None
    return True, "Registered investment adviser (SEC)"
