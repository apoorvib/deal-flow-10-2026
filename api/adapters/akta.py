"""akta.pro entity corroboration (assumptions.md A21/A22).

AKTA_API_KEY is not provisioned, so this serves fixtures/cache/entities.json behind the
interface the live client will use. akta.pro holds company data only: it can corroborate
that an entity is a real operating business, never that anyone is accredited.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

CACHE = Path(__file__).resolve().parents[2] / "fixtures" / "cache" / "entities.json"


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def corroborate_entity(name: str, domain: str | None = None) -> dict:
    """Returns {resolved, headcount, funding_total, operating_business_signal, adverse_news, cache_hit}."""
    try:
        data = json.loads(CACHE.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        data = {}
    # PRISM span: akta.corroborate (name, resolved, adverse_news count) attaches here.
    entry = data.get(_norm(name)) or data.get("default") or {}
    resolved = bool(entry.get("resolved"))
    return {
        "name": name,
        "resolved": resolved,
        "headcount": entry.get("headcount"),
        "funding_total": entry.get("funding_total"),
        "operating_business_signal": resolved and bool(entry.get("headcount")),
        "adverse_news": entry.get("adverse_news") or [],
        "cache_hit": True,
    }
