"""akta.pro company corroboration with a deterministic cache fallback.

akta.pro supplies company and news data only. This adapter can corroborate that
an entity resolves to an operating business, but it never establishes a
person's accredited status.
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

from api.tracing import span

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "fixtures" / "cache" / "entities.json"
load_dotenv(ROOT / ".env")


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _cache() -> dict[str, Any]:
    try:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def _cached(name: str, reason: str) -> dict[str, Any]:
    entry = _cache().get(_norm(name)) or _cache().get("default") or {}
    return {
        "name": name,
        "resolved": bool(entry.get("resolved")),
        "company_id": entry.get("company_id"),
        "headcount": entry.get("headcount"),
        "funding_total": entry.get("funding_total"),
        "operating_business_signal": bool(entry.get("resolved")) and bool(entry.get("headcount")),
        "adverse_news": entry.get("adverse_news") or [],
        "cache_hit": True,
        "cache_reason": reason,
        "source": "fixture",
    }


def _items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("data", "results", "companies", "items", "matches"):
            value = payload.get(key)
            if isinstance(value, list):
                return [x for x in value if isinstance(x, dict)]
    return []


def _first(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict):
        for key in ("data", "company", "result"):
            value = payload.get(key)
            if isinstance(value, dict):
                return value
        return payload
    return {}


def _value(data: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in data and data[name] is not None:
            return data[name]
    return None


def _find(data: Any, *names: str) -> Any:
    if isinstance(data, dict):
        direct = _value(data, *names)
        if direct is not None:
            return direct
        for value in data.values():
            found = _find(value, *names)
            if found is not None:
                return found
    elif isinstance(data, list):
        for value in data:
            found = _find(value, *names)
            if found is not None:
                return found
    return None


def _negative_news(payload: Any) -> list[dict[str, Any]]:
    out = []
    for row in _items(payload):
        sentiment = str(_value(row, "sentiment", "sentiment_label") or "").lower()
        score = _value(row, "sentiment_score", "score")
        negative = "negative" in sentiment or (isinstance(score, (int, float)) and score < 0)
        if negative:
            out.append({
                "headline": _value(row, "title", "headline") or "Untitled signal",
                "sentiment": _value(row, "sentiment", "sentiment_label") or "negative",
                "url": _value(row, "url", "article_url"),
                "published_date": _value(row, "published_date", "published_at"),
            })
    return out[:20]


class _AktaClient:
    def __init__(self) -> None:
        self.key = (os.getenv("AKTA_API_KEY") or "").strip()
        self.base = (os.getenv("AKTA_API_BASE_URL") or "https://api.akta.pro").rstrip("/")
        self.timeout = float(os.getenv("AKTA_TIMEOUT_SECONDS", "12"))

    def get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        response = httpx.get(
            f"{self.base}{path}",
            headers={"x-api-key": self.key, "Accept": "application/json"},
            params=params,
            timeout=self.timeout,
        )
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict):
            return {"data": body}
        return body

    def first_success(self, paths: list[tuple[str, dict[str, Any]]]) -> dict[str, Any]:
        last: Exception | None = None
        for path, params in paths:
            try:
                return self.get(path, params)
            except Exception as exc:  # noqa: BLE001
                last = exc
        raise RuntimeError(f"akta request failed ({type(last).__name__ if last else 'unknown'})")


def _live(name: str, domain: str | None) -> dict[str, Any]:
    client = _AktaClient()
    search = client.first_success([
        (os.getenv("AKTA_SEARCH_PATH", "/api/v1/company/search"), {"query": name}),
        ("/api/v1/companies/search", {"query": name}),
        ("/api/v1/search/company", {"query": name}),
    ])
    matches = _items(search)
    company = matches[0] if matches else _first(search)
    company_id = _value(company, "uuid", "id", "company_uuid", "companyId")
    website = domain or _value(company, "website", "domain", "url")
    if not company_id and not website:
        raise RuntimeError("akta company search returned no resolvable company")

    identity = {
        "name": name,
        "resolved": bool(company_id or website),
        "company_id": company_id,
        "headcount": None,
        "funding_total": None,
    }
    if company_id:
        detail = client.first_success([
            (os.getenv("AKTA_COMPANY_PATH", "/api/v1/company/enrichment/"), {
                "company": company_id,
                "sections": "firmographic,business_model,headcount,funding",
            }),
            (f"/api/v1/company/{company_id}", {}),
        ])
        identity.update(_first(detail))
    news = client.get(
        os.getenv("AKTA_NEWS_PATH", "/api/v1/news/"),
        {"company": company_id or website, "limit": 20},
    )
    headcount = _find(identity, "headcount", "employee_count", "employees", "total_employees")
    funding = _find(identity, "funding_total", "total_funding", "funding", "total_funding_amount")
    return {
        "name": name,
        "resolved": bool(company_id or website),
        "company_id": company_id,
        "headcount": headcount,
        "funding_total": funding,
        "operating_business_signal": bool(company_id or website) and bool(headcount),
        "adverse_news": _negative_news(news),
        "cache_hit": False,
        "source": "akta.pro",
        "checked_at": time.time(),
    }


def corroborate_entity(name: str, domain: str | None = None) -> dict[str, Any]:
    """Return company corroboration; failures always degrade to the fixture."""
    if os.getenv("DEMO_MODE", "cached") != "live" or not os.getenv("AKTA_API_KEY"):
        return _cached(name, "DEMO_MODE=cached or AKTA_API_KEY missing")
    try:
        with span("akta.corroborate", model="akta.pro", input_text=name) as trace:
            result = _live(name, domain)
            trace.set(
                output_message=json.dumps({
                    "resolved": result["resolved"],
                    "adverse_news": len(result["adverse_news"]),
                }),
                metadata={"company_id": result.get("company_id")},
            )
            return result
    except Exception as exc:  # noqa: BLE001
        return _cached(name, f"live lookup failed ({type(exc).__name__})")
