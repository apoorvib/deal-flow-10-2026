"""FINRA BrokerCheck license lookup via a Solari cloud browser (assumptions.md A19/A20).

DEMO_MODE=cached -> serve fixtures/cache/licenses.json immediately.
DEMO_MODE=live   -> run scripts/solari/lookup.mjs (Node SDK) with a hard timeout,
                    fall back to cache on ANY failure. Never raises.
A CRD beginning with '9' is the UI's documented not-found case in every mode.
"""

from __future__ import annotations

import datetime
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "fixtures" / "cache" / "licenses.json"
SHOTS = ROOT / "fixtures" / "cache" / "screenshots"
SCRIPT = ROOT / "scripts" / "solari" / "lookup.mjs"
TIMEOUT_S = 45


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _cache() -> dict:
    try:
        return json.loads(CACHE.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def _save_cache(crd: str, entry: dict) -> None:
    try:
        data = _cache()
        data[crd] = entry
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        CACHE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass


def _from_cache(crd: str, why: str) -> dict:
    data = _cache()
    entry = data.get(crd) or {**data.get("default", {"found": True, "name": "Registered representative",
                                                      "licenses": []}), "crd": crd}
    return {**entry, "cache_hit": True, "cache_reason": why}


def _live(crd: str) -> dict:
    node = shutil.which("node") or shutil.which("node.exe")
    key = (os.getenv("SOLARI_API_KEY") or "").strip()
    if not node or not key or not SCRIPT.exists():
        raise RuntimeError("Solari live lookup unavailable (node, key or script missing)")
    SHOTS.mkdir(parents=True, exist_ok=True)
    shot = SHOTS / f"brokercheck_{crd}.png"
    # PRISM span: solari.brokercheck (crd, source_url, screenshot, seconds) attaches here.
    proc = subprocess.run([node, str(SCRIPT), crd, str(shot)], capture_output=True, text=True,
                          timeout=TIMEOUT_S, cwd=str(SCRIPT.parent),
                          env={**os.environ, "SOLARI_API_KEY": key})
    if proc.returncode != 0:
        raise RuntimeError(f"lookup failed: {proc.stderr.strip()[:200]}")
    out = json.loads(proc.stdout.strip().splitlines()[-1])
    return {
        "crd": crd,
        "found": bool(out.get("found")),
        "name": out.get("name"),
        "licenses": out.get("licenses") or [],
        "source_url": out.get("sourceUrl"),
        "screenshot_path": str(shot.relative_to(ROOT)) if shot.exists() else None,
        "checked_at": _now(),
        "seconds": out.get("seconds"),
    }


def check_license(license_type: str | None, crd: str) -> dict:
    """Returns {found, name, licenses, source_url, screenshot_path, checked_at, cache_hit, ...}."""
    crd = (crd or "").strip()
    if not crd or crd.startswith("9"):
        return {"crd": crd, "found": False, "name": None, "licenses": [], "cache_hit": False,
                "checked_at": _now(), "source_url": None, "screenshot_path": None}
    if os.getenv("DEMO_MODE", "cached") != "live":
        return _from_cache(crd, "DEMO_MODE=cached")
    try:
        res = _live(crd)
    except Exception as e:  # noqa: BLE001 -- the demo must never break on the browser
        return _from_cache(crd, f"live lookup failed ({type(e).__name__})")
    want = (license_type or "").replace("series", "Series ")
    if res["found"] and want and res["licenses"] and want not in res["licenses"]:
        res["found"] = False
        res["mismatch"] = f"BrokerCheck shows {', '.join(res['licenses'])}, not {want}"
    _save_cache(crd, res)
    return {**res, "cache_hit": False}
