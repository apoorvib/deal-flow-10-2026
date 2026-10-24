"""Deterministic generator for synthetic Savy fixture documents.

Run from repo root:  python scripts/make_fixtures.py
Outputs PNG + TXT pairs, README.md and manifest.json under fixtures/docs/.
All people, employers, banks and numbers are fictional.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "fixtures" / "docs"
HEADER = "SYNTHETIC SPECIMEN \u2014 NOT A REAL DOCUMENT"
WIDTH = 1100
MARGIN = 50

FONT_CANDIDATES = [
    ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
    ("/mnt/c/Windows/Fonts/arial.ttf", "/mnt/c/Windows/Fonts/arialbd.ttf"),
]


def load_font(size: int, bold: bool = False):
    for reg, bd in FONT_CANDIDATES:
        path = bd if bold else reg
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def money(x: float) -> str:
    return f"${x:,.2f}"


# A document is a list of items:
#   ("h1", text) big bold, ("h2", text) bold, ("p", text) body,
#   ("kv", label, value) label left / value right-aligned, ("rule",), ("gap",)
#   ("row", [cells], [col_x_fracs], [right_align_flags], bold)
def to_text(items) -> str:
    lines = [HEADER, ""]
    for it in items:
        kind = it[0]
        if kind in ("h1", "h2", "p"):
            lines.append(it[1])
        elif kind == "kv":
            lines.append(f"{it[1]}: {it[2]}")
        elif kind == "row":
            lines.append(" | ".join(it[1]))
        elif kind == "rule":
            lines.append("-" * 60)
        elif kind == "gap":
            lines.append("")
    return "\n".join(lines) + "\n"


def render(items, path: Path) -> None:
    f_banner = load_font(30, bold=True)
    f_h1 = load_font(36, bold=True)
    f_h2 = load_font(26, bold=True)
    f_p = load_font(24)
    f_pb = load_font(24, bold=True)
    lh = {"h1": 56, "h2": 44, "p": 38, "kv": 40, "row": 38, "rule": 22, "gap": 20}
    height = MARGIN * 2 + 80 + sum(lh[it[0]] for it in items)
    img = Image.new("RGB", (WIDTH, height), "white")
    d = ImageDraw.Draw(img)
    # banner
    d.rectangle([MARGIN, MARGIN, WIDTH - MARGIN, MARGIN + 56], outline="black", width=3)
    tw = d.textlength(HEADER, font=f_banner)
    d.text(((WIDTH - tw) / 2, MARGIN + 11), HEADER, fill="black", font=f_banner)
    y = MARGIN + 80
    right = WIDTH - MARGIN
    usable = WIDTH - 2 * MARGIN
    for it in items:
        kind = it[0]
        if kind == "h1":
            d.text((MARGIN, y), it[1], fill="black", font=f_h1)
        elif kind == "h2":
            d.text((MARGIN, y), it[1], fill="black", font=f_h2)
        elif kind == "p":
            d.text((MARGIN, y), it[1], fill="black", font=f_p)
        elif kind == "kv":
            d.text((MARGIN, y), it[1], fill="black", font=f_p)
            vw = d.textlength(it[2], font=f_pb)
            d.text((right - vw, y), it[2], fill="black", font=f_pb)
            d.line([MARGIN, y + 34, right, y + 34], fill=(200, 200, 200), width=1)
        elif kind == "row":
            cells, xs, ralign, bold = it[1], it[2], it[3], it[4]
            font = f_pb if bold else f_p
            for i, cell in enumerate(cells):
                if ralign[i]:
                    edge = MARGIN + usable * (xs[i + 1] if i + 1 < len(xs) else 1.0)
                    d.text((edge - d.textlength(cell, font=font), y), cell, fill="black", font=font)
                else:
                    d.text((MARGIN + usable * xs[i], y), cell, fill="black", font=font)
        elif kind == "rule":
            d.line([MARGIN, y + 10, right, y + 10], fill="black", width=2)
        y += lh[kind]
    img.save(path, format="PNG", optimize=False)
    path.with_suffix(".txt").write_text(to_text(items), encoding="utf-8")


SS_WAGE_BASE = {2024: 168_600.00, 2025: 176_100.00}


def w2(year, employee, ssn, address, employer, ein, emp_addr, wages, fed_wh, state_wh, state="NY"):
    ss_wages = min(wages, SS_WAGE_BASE[year])
    return [
        ("h1", "Form W-2  Wage and Tax Statement"),
        ("p", f"Tax year {year}    Department of the Treasury - Internal Revenue Service"),
        ("rule",),
        ("kv", "a  Employee's social security number", ssn),
        ("kv", "b  Employer identification number (EIN)", ein),
        ("kv", "c  Employer's name", employer),
        ("kv", "   Employer's address", emp_addr),
        ("kv", "e  Employee's name", employee),
        ("kv", "f  Employee's address", address),
        ("rule",),
        ("kv", "Box 1  Wages, tips, other compensation", money(wages)),
        ("kv", "Box 2  Federal income tax withheld", money(fed_wh)),
        ("kv", "Box 3  Social security wages", money(ss_wages)),
        ("kv", "Box 4  Social security tax withheld", money(round(ss_wages * 0.062, 2))),
        ("kv", "Box 5  Medicare wages and tips", money(wages)),
        # 1.45% Medicare + 0.9% Additional Medicare Tax on wages over $200k (employer must withhold).
        ("kv", "Box 6  Medicare tax withheld", money(round(wages * 0.0145 + max(0.0, wages - 200_000) * 0.009, 2))),
        ("kv", "Box 15  State", state),
        ("kv", "Box 16  State wages, tips, etc.", money(wages)),
        ("kv", "Box 17  State income tax", money(state_wh)),
        ("rule",),
        ("p", f"Copy B - To Be Filed With Employee's FEDERAL Tax Return ({year})"),
    ]


def f1040(year, name, ssn, address, wages, interest, sched1, adjustments):
    total = wages + interest + sched1
    agi = total - adjustments
    items = [
        ("h1", "Form 1040  U.S. Individual Income Tax Return"),
        ("p", f"Tax year {year}    Department of the Treasury - Internal Revenue Service"),
        ("rule",),
        ("kv", "Your first name and last name", name),
        ("kv", "Your social security number", ssn),
        ("kv", "Home address", address),
        ("kv", "Filing Status", "Single"),
        ("rule",),
        ("h2", "Income"),
        ("kv", "1a  Total amount from Form(s) W-2, box 1", money(wages)),
        ("kv", "1z  Add lines 1a through 1h", money(wages)),
        ("kv", "2b  Taxable interest", money(interest)),
        ("kv", "3b  Ordinary dividends", money(0)),
        ("kv", "8   Additional income from Schedule 1, line 10", money(sched1)),
        ("kv", "9   Total income (add lines 1z through 8)", money(total)),
        ("kv", "10  Adjustments to income from Schedule 1, line 26", money(adjustments)),
        ("kv", "11  Adjusted gross income (line 9 minus line 10)", money(agi)),
        ("rule",),
        ("p", "Under penalties of perjury, I declare that I have examined this return."),
        ("p", f"Signature: {name}    Occupation: see W-2"),
    ]
    return items, total, agi


def bank_statement():
    opening = 412_380.00
    tx = [
        ("09/02/2026", "Payroll deposit - Fictional Holdings Co.", 18_450.00, None),
        ("09/04/2026", "Mortgage payment - Example Home Loans", None, 6_820.00),
        ("09/08/2026", "Transfer from savings ****4417", 25_000.00, None),
        ("09/11/2026", "Credit card payment - Specimen Card", None, 4_312.55),
        ("09/15/2026", "Dividend deposit - Placeholder Brokerage", 3_275.40, None),
        ("09/17/2026", "Utility payment - Imaginary Power & Light", None, 412.18),
        ("09/19/2026", "Wire out - Sample Escrow Services", None, 15_000.00),
        ("09/23/2026", "Mobile check deposit #1182", 2_600.00, None),
        ("09/26/2026", "Insurance premium - Notional Mutual", None, 1_148.90),
        ("09/30/2026", "Payroll deposit - Fictional Holdings Co.", 18_450.00, None),
    ]
    deposits = round(sum(t[2] for t in tx if t[2]), 2)
    withdrawals = round(sum(t[3] for t in tx if t[3]), 2)
    correct = round(opening + deposits - withdrawals, 2)
    stated = round(correct + 250_000.00, 2)
    assert abs(stated - correct - 250_000.00) < 0.005
    xs = [0.0, 0.17, 0.62, 0.81]
    ra = [False, False, True, True]
    items = [
        ("h1", "First Fictional Bank"),
        ("p", "100 Placeholder Plaza, Springfield, NY 10000"),
        ("h2", "Monthly Checking Statement"),
        ("rule",),
        ("kv", "Account holder", "Robert Specimen"),
        ("kv", "Account number", "XXXXXX-8842"),
        ("kv", "Statement period", "September 1, 2026 \u2013 September 30, 2026"),
        ("kv", "Statement generated", "August 14, 2026"),
        ("rule",),
        ("kv", "Opening balance (September 1, 2026)", money(opening)),
        ("gap",),
        ("row", ["Date", "Description", "Deposits", "Withdrawals"], xs, ra, True),
        ("rule",),
    ]
    for date, desc, dep, wd in tx:
        items.append(("row", [date, desc, money(dep) if dep else "", money(wd) if wd else ""], xs, ra, False))
    items += [
        ("rule",),
        ("kv", "Total deposits", money(deposits)),
        ("kv", "Total withdrawals", money(withdrawals)),
        ("kv", "Closing balance (September 30, 2026)", money(stated)),
        ("gap",),
        ("p", "Member FDIC (fictional). Questions? Call 1-800-555-0100."),
    ]
    return items, opening, deposits, withdrawals, correct, stated


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []

    def emit(name, items, case, doc_type, year, income, balance, holder):
        render(items, OUT / name)
        manifest.append({"file": name, "case": case, "docType": doc_type, "taxYear": year,
                         "expectedIncome": income, "expectedBalance": balance, "holderName": holder})

    # Case 1 - clean income
    jane = dict(employee="Jane Specimen", ssn="XXX-XX-1234", address="12 Example Lane, Springfield, NY 10001",
                employer="Acme Analytics LLC", ein="XX-XXX4821", emp_addr="500 Sample Ave, Springfield, NY 10002")
    emit("case1_w2_2024.png", w2(2024, wages=262_400.00, fed_wh=52_480.00, state_wh=15_744.00, **jane),
         1, "w2", 2024, 262_400.00, None, "Jane Specimen")
    emit("case1_w2_2025.png", w2(2025, wages=275_900.00, fed_wh=55_180.00, state_wh=16_554.00, **jane),
         1, "w2", 2025, 275_900.00, None, "Jane Specimen")
    items, total, agi = f1040(2025, "Jane Specimen", "XXX-XX-1234", jane["address"],
                              wages=275_900.00, interest=5_250.00, sched1=0.00, adjustments=4_150.00)
    assert total == 281_150.00 and agi == 277_000.00
    emit("case1_1040_2025.png", items, 1, "form_1040", 2025, agi, None, "Jane Specimen")

    # Case 4 - arithmetic forgery
    items, opening, dep, wd, correct, stated = bank_statement()
    emit("case4_bank_statement.png", items, 4, "bank_statement", None, None, stated, "Robert Specimen")
    print(f"case4: opening {money(opening)} + deposits {money(dep)} - withdrawals {money(wd)}")
    print(f"case4: correct closing {money(correct)} | stated closing {money(stated)}")

    # Case 5 - self-report contradiction / total-income trap
    maya = dict(employee="Maya Specimen", ssn="XXX-XX-5678", address="88 Imaginary Rd, Lakeside, CA 90000",
                employer="Northwind Robotics Inc.", ein="XX-XXX7310", emp_addr="1 Placeholder Pkwy, Lakeside, CA 90001", state="CA")
    emit("case5_w2_2025.png", w2(2025, wages=240_000.00, fed_wh=46_800.00, state_wh=19_200.00, **maya),
         5, "w2", 2025, 240_000.00, None, "Maya Specimen")
    emit("case5_w2_2024.png", w2(2024, wages=185_000.00, fed_wh=33_300.00, state_wh=14_800.00, **maya),
         5, "w2", 2024, 185_000.00, None, "Maya Specimen")
    items, total, agi = f1040(2024, "Maya Specimen", "XXX-XX-5678", maya["address"],
                              wages=185_000.00, interest=0.00, sched1=27_000.00, adjustments=27_000.00)
    assert total == 212_000.00 and agi == 185_000.00
    emit("case5_1040_2024.png", items, 5, "form_1040", 2024, agi, None, "Maya Specimen")

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (OUT / "README.md").write_text(README.format(correct=money(correct), stated=money(stated),
                                                 dep=money(dep), wd=money(wd)), encoding="utf-8")
    print(f"wrote {len(manifest)} documents to {OUT}")


README = """# Synthetic fixture documents

Generated by `python scripts/make_fixtures.py` (deterministic). Every document starts with
`SYNTHETIC SPECIMEN \u2014 NOT A REAL DOCUMENT`. All names, employers, banks, EINs and SSNs are fictional.
Each PNG has a sibling `.txt` with its exact text. `manifest.json` lists expected values
(for 1040s `expectedIncome` is AGI, line 11; for case 4 `expectedBalance` is the STATED closing balance).

## Case 1 \u2014 clean income (Jane Specimen, Acme Analytics LLC)
| File | Key figures |
|---|---|
| case1_w2_2024.png | W-2 2024, Box 1 wages $262,400.00 |
| case1_w2_2025.png | W-2 2025, Box 1 wages $275,900.00 |
| case1_1040_2025.png | 1040 2025, Single. 1z $275,900.00 + 2b $5,250.00 = line 9 $281,150.00; line 10 $4,150.00; line 11 AGI $277,000.00 |

Both years > $200k individual threshold: should pass.

## Case 4 \u2014 arithmetic forgery (Robert Specimen, First Fictional Bank)
| File | Key figures |
|---|---|
| case4_bank_statement.png | Period Sep 1\u201330, 2026; opening $412,380.00; total deposits {dep}; total withdrawals {wd}; stated closing {stated} |

Defects (not annotated in the document):
1. "Statement generated: August 14, 2026" precedes the statement period it reports.
2. Stated closing balance {stated} \u2260 opening + deposits \u2212 withdrawals = **{correct}** (inflated by exactly $250,000.00).
Deposit/withdrawal totals do match the listed rows.

## Case 5 \u2014 self-report contradicts documents (Maya Specimen, Northwind Robotics Inc.)
| File | Key figures |
|---|---|
| case5_w2_2025.png | W-2 2025, Box 1 wages $240,000.00 |
| case5_w2_2024.png | W-2 2024, Box 1 wages $185,000.00 |
| case5_1040_2024.png | 1040 2024, Single. 1z $185,000.00; line 8 Schedule 1 $27,000.00; line 9 total income $212,000.00; line 10 $27,000.00; line 11 AGI $185,000.00 |

Trap: line 9 "total income" ($212,000) exceeds $200k, but AGI (line 11) is $185,000, as is the 2024 W-2.
2024 income is therefore below the $200k individual threshold.
"""


if __name__ == "__main__":
    main()
