"""Seed deterministic document-review caches for the offline Savy demo.

This is intentionally a cache builder, not a second parser used by the API.
Live mode fills the same cache with Nicrron debate results; this script gives the
demo a safe, repeatable offline starting point from the synthetic fixtures.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from api.debate import _cache_put, sha256

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "fixtures" / "docs"


def _summary(row: dict) -> str:
    kind = row["docType"]
    if kind == "w2":
        return "Form W-2 for tax year %s, $%s reported." % (
            row["taxYear"], f'{row["expectedIncome"]:,.0f}')
    if kind == "form_1040":
        return "Form 1040 for tax year %s, $%s AGI reported." % (
            row["taxYear"], f'{row["expectedIncome"]:,.0f}')
    if kind == "bank_statement":
        return "Bank statement ending 2026-09-30, $%s closing balance." % (
            f'{row["expectedBalance"]:,.2f}')
    return "Synthetic financial document reviewed."


def _adjudication(row: dict) -> dict:
    fields: dict[str, dict] = {
        "holderName": {"value": row["holderName"], "confidence": 0.99, "sourceQuote": row["holderName"]},
    }
    if row["taxYear"] is not None:
        fields["taxYear"] = {"value": row["taxYear"], "confidence": 0.99,
                              "sourceQuote": "Tax year %s" % row["taxYear"]}
    if row["expectedIncome"] is not None:
        fields["income"] = {"value": row["expectedIncome"], "confidence": 0.99,
                            "sourceQuote": "Adjusted gross income / Box 1: $%s" %
                            f'{row["expectedIncome"]:,.2f}'}
    if row["expectedBalance"] is not None:
        fields["balance"] = {"value": row["expectedBalance"], "confidence": 0.99,
                             "sourceQuote": "Closing balance: $%s" %
                             f'{row["expectedBalance"]:,.2f}'}
        fields["statementDate"] = {"value": "2026-09-30", "confidence": 0.99,
                                   "sourceQuote": "September 30, 2026"}
    flags: list[str] = []
    if row["case"] == 4:
        flags = [
            "Closing balance arithmetic does not reconcile: opening + deposits - withdrawals equals $452,461.77, but the document states $702,461.77.",
            "Statement generated August 14, 2026 precedes the September 1-30, 2026 statement period.",
        ]
    return {
        "fields": fields,
        "confidence": 0.98 if not flags else 0.96,
        "flags": flags,
        "summary": _summary(row),
        "trustAssessment": "Synthetic fixture is internally consistent." if not flags
                           else "The document contains two unresolved internal defects.",
    }


def main() -> None:
    manifest = json.loads((DOCS / "manifest.json").read_text(encoding="utf-8"))
    for row in manifest:
        filename = row["file"]
        data = (DOCS / filename).read_bytes()
        adjudication = _adjudication(row)
        _cache_put(sha256(data), {
            "docType": row["docType"],
            "adjudication": adjudication,
            "turns": [],
            "seconds": 0.0,
        })
    print("Seeded %s document review caches." % len(manifest))


if __name__ == "__main__":
    main()
