# Accredited Investor Verification — Hackathon Build Spec

*Deal Flow @ Betaworks · October 24, 2026 · judging tonight*

Product research and market context: [`plan.md`](../../../plan.md). Sponsor resources: [`resources.md`](../../../resources.md).

---

## 1. What We're Building

A verification service that takes an investor's claim of accredited status, extracts the supporting facts from their documents, evaluates them against the actual Rule 501(a) tests, and issues either an auto-approval with a letter or a flagged case for human review — with a complete, timestamped audit trail of every input and decision.

**The pitch, in one line:** the product is not document-reading AI, it's *liability protection*. Per `plan.md` §11, a documented "reasonable steps" process preserves the issuer's Reg D exemption even if the investor lied. The audit trail **is** the product.

**Demo win condition:** a judge watches a clean case go from upload to signed letter in under a minute, watches a doctored document get caught, and then sees the complete decision trail that makes it defensible.

---

## 2. Hard Constraints

| Constraint | Consequence |
|---|---|
| Judging tonight (~6 hrs build) | Core must be small; every integration needs a fallback |
| All 5 sponsor tools must be integrated (organizer rule) | 2 deep (Nicrron, PRISM), 3 thin-but-real (Roundtable, akta.pro, Solari) |
| One engineer (Apoorv) owns core + all 5 integrations | Thin integrations are one call each, behind a uniform adapter |
| Frontend teammate works in parallel | API contract frozen in first 20 minutes, mock served immediately |
| Second backend engineer's deterministic parser is a *maybe* | Lives behind `DocumentExtractor` interface; never on the critical path |
| Nicrron credits expire 11:59 PM ET today | Redeem first, before any code |
| No Ninoo Builder (user decision) | Forfeits the NicrronNinoo-specific prize track; Nicrron API still satisfies "used the sponsor" |

---

## 3. Non-Goals (Explicit Cut List)

Cut for time, not because they're wrong — most are on `plan.md`'s roadmap:

- **Plaid / bank account linking** — production access takes weeks (`plan.md` §14); net worth comes from document upload instead
- **Credit bureaus, IRS IVES transcripts** — difficulty 4–5, enrollment gated
- **Persona / Alloy KYC-AML** — another signup, orthogonal to the accreditation story
- **Auth, user accounts, multi-tenancy, billing**
- **A real database** — Roundtable is the case-file store; live state is in-process
- **E-signature / DocuSign, wire instructions**
- **The 90-day re-verification freshness loop** (mention in pitch, don't build)
- **PRISM's challenge-track requirements** (20+ runs on fixed inputs, MCP-added rules) — only if time remains after the demo is safe

---

## 4. Architecture

A linear pipeline of pure stage functions over a single `Case` object. Each stage is `(Case) -> Case`, independently testable, and emits one PRISM span plus one Roundtable case-file version.

```
INTAKE → EXTRACT → ENRICH → EVALUATE → TRIAGE → ISSUE
   │        │         │         │          │        │
   │        │         │         │          │        └─ letter + audit file   (Nicrron: prose only)
   │        │         │         │          └────────── decision routing      (deterministic)
   │        │         │         └───────────────────── Rule 501(a) tests     (deterministic)
   │        │         └─────────────────────────────── BrokerCheck / company (Solari, akta.pro)
   │        └───────────────────────────────────────── doc → fields+conf     (Nicrron, deep)
   └──────────────────────────────────────────────────  form + uploads

   every transition ──► PRISM span (deep)  +  Roundtable case-file version (thin)
```

### Domain model

```python
Case:
    case_id:        str
    subject_type:   "individual" | "entity"
    claimed_path:   "income" | "net_worth" | "license" | "entity_assets" | "min_investment"
    commitment_usd: int | None          # for the min-investment shortcut
    documents:      list[Document]
    extracted:      dict[str, Field]    # Field = {value, confidence, source_quote, doc_id}
    evidence:       dict[str, Any]      # external check results (Solari, akta.pro)
    rule_results:   list[RuleResult]
    decision:       "auto_approved" | "needs_review" | "rejected" | "needs_documents"
    audit_trail:    list[AuditEvent]    # append-only; (ts, stage, actor, summary, trace_id)
    letter_md:      str | None
```

**Core invariant:** `decision` is a pure function of `rule_results` + confidence thresholds. No model output ever writes to `decision`.

---

## 5. Integration Map — Exactly Where Each Tool Is Called

### 5.1 Nicrron API — DEEP

Base URL `https://api.nicrron.ai/v1`, OpenAI-compatible, so the integration is a `base_url` swap and everything after is product work. **Three call sites:**

**(a) `EXTRACT` — document classification** · model `nicrron/cheapest`
`classify_document(doc) -> "w2" | "1040" | "bank_statement" | "brokerage_statement" | "cpa_letter" | "trust_deed" | "unknown"`
So the investor never has to tell us what they uploaded.

**(b) `EXTRACT` — field extraction** · model `anthropic/claude-sonnet-5` (vision), structured JSON output
`extract_fields(doc, doc_type) -> {field_name: {value, confidence, source_quote}}`

Per-field `confidence` and `source_quote` are **required** in the schema, not optional niceties:
- `confidence` drives triage — it's the input to the auto-approve decision
- `source_quote` is the citation shown in the audit trail ("we read $214,500 from line 11 of the 1040")

Target fields by type: `w2` → wages, tax year, employer; `1040` → AGI/total income, tax year, filing status; `bank_statement`/`brokerage_statement` → institution, ending balance, statement date; `cpa_letter` → attestation type, signer, license no., date.

**(c) `ISSUE` — letter prose** · model `anthropic/claude-sonnet-5`
`draft_letter(case) -> markdown`. The model receives the *already-decided* rule results and writes prose around them. It is explicitly instructed that all figures and the verdict are fixed inputs. **The model never decides, only reads and writes.**

### 5.2 PRISM — DEEP

`pip install prismtrace-sdk` (or OTel exporter), key in `PRISMTRACE_API_KEY`. Wire this **first** — retrofitting tracing is miserable.

**Span tree per case:**
```
case:{case_id}                             root
├── stage:extract
│   ├── nicrron.classify   model, tokens, doc_id
│   └── nicrron.extract    model, tokens, doc_id, field_count, min_confidence
├── stage:enrich
│   ├── solari.brokercheck      target, license_found, screenshot_url, duration, cache_hit
│   └── akta.company_enrich     company, headcount, adverse_news, cache_hit
├── stage:evaluate
│   └── rule:{rule_id}     outcome, inputs_used, citation      ← one span per rule
├── stage:triage           decision, reason
└── stage:issue            letter_len
```

Why deep here pays double: this span tree *is* the §11 audit file. On stage we open a verification, click through to its trace, and show that every input, every rule, and every model call is logged with a timestamp and a decision reason. The sponsor integration and the product differentiator are the same artifact.

**Stretch (bonus track only, if the demo is already safe):** encode a PRISM guardrail for the invariant *"no case reaches `ISSUE` without ≥1 PASS rule and all `inputs_used` above threshold,"* then show v1 violating it and v2 not.

### 5.3 Roundtable — THIN (one call site, system of record)

At **every stage transition**, write the case file to a Roundtable workspace. Version history then comes free and maps exactly to the pipeline: v1 intake → v2 extracted → v3 enriched → v4 evaluated → v5 issued. An immutable versioned case file is a legitimate compliance artifact, which is why this is honest use rather than decoration.

Plus one agent-to-agent message per transition in a per-case thread, e.g. `extractor → rules-engine: 7 fields extracted, 2 below confidence threshold`.

**Our code orchestrates; Roundtable stores.** Deliberate — it's the SDK we've never opened, so it must not be load-bearing. Implemented behind:

```python
class CaseStore(Protocol):
    def save_version(self, case: Case, stage: str) -> str: ...
    def post_handoff(self, case_id: str, frm: str, to: str, msg: str) -> None: ...
```
`LocalJsonStore` ships first and always works; `RoundtableStore` swaps in.

### 5.4 akta.pro — THIN (one call site, entity cases only)

Fires at `ENRICH` **only when `subject_type == "entity"`.** Endpoints (confirmed from `docs.akta.pro/llms.txt`):
1. **Company Search** — resolve the entity by name or domain → UUID
2. **Company Data** — firmographics, headcount, funding, financials
3. **News Signals** — AI-summarized articles with event type + sentiment → adverse-news detection

Produces **evidence, never verdicts**:
```python
evidence["entity_corroboration"] = {
    "resolved": bool, "headcount": int|None, "funding_total": int|None,
    "operating_business_signal": bool,   # resolved + has headcount/traffic/jobs
    "adverse_news": [ {title, sentiment, date} ],
}
```
These feed a `SHELL_COMPANY_RISK` check that can route to `needs_review` — it can **never** produce an accreditation pass. The API has no individual-level or AUM data (verified), so overclaiming here would be wrong. The UI labels the panel *"Entity corroboration — not a verification source."*

### 5.5 Solari — THIN (one call site, license path only)

Fires at `ENRICH` **only when `claimed_path == "license"`.** A scripted cloud-browser task against FINRA BrokerCheck, which has **no usable public API** (`plan.md` §14) — so a computer-use agent is genuinely the right tool, not a gimmick.

```python
evidence["license_check"] = {
    "licenses": ["Series 65"], "active": True,
    "source_url": "https://brokercheck.finra.org/...",
    "screenshot_url": "...",          # ← the actual deliverable
    "checked_at": "2026-10-24T19:41:02Z",
    "cache_hit": False,
}
```

**The screenshot is the point.** A timestamped capture of the regulator's own page is documented "reasonable steps." It goes in the audit file and on screen during the demo.

Highest-risk integration on the board: computer-use is slow, flaky, and WiFi-dependent (hence Pangea in `resources.md`). Controls: 15-minute feasibility spike early; hard 45s timeout; pre-cached results for both demo identities; live attempt falls back to cache silently.

---

## 6. Rules Engine (the deterministic core)

Five rules, each returning a fully explainable result:

```python
RuleResult:
    rule_id:     str
    citation:    str                      # e.g. "17 CFR 230.501(a)(6)"
    outcome:     "PASS" | "FAIL" | "INSUFFICIENT_DATA"
    inputs_used: dict[str, Any]           # exact field values consumed
    reason:      str                      # human-readable, shown in UI and letter
```

| `rule_id` | Citation | Test |
|---|---|---|
| `INCOME` | 501(a)(6) | ≥$200K individual (≥$300K joint) in **each** of the last 2 years + reasonable expectation for current year |
| `NET_WORTH` | 501(a)(5) | Net worth >$1M **excluding primary residence**; flag mortgage debt added in last 60 days |
| `LICENSE` | 501(a)(10) | Series 7, 65, or 82 held in good standing (from Solari evidence) |
| `ENTITY_ASSETS` | 501(a)(3)/(9) | Entity with >$5M total assets or >$5M investments |
| `MIN_INVESTMENT` | Mar 2025 SEC no-action letter | Commitment ≥$200K individual / ≥$1M entity + self-cert funds not third-party financed |

Plus one non-501(a) risk check: `SHELL_COMPANY_RISK` (entity cases, from akta.pro evidence) — can only route to review, never pass or fail accreditation.

**Why deterministic matters:** it's what makes the output defensible, it's trivially testable, and it's cheap to build — the entire engine is threshold comparisons over extracted fields. This is the difference between a product and a ChatGPT wrapper.

---

## 7. Triage Logic

Evaluated after all rules run. Produces `plan.md` §4's 70/20/10 split:

```
if any rule PASS and all its inputs_used have confidence ≥ 0.85
   and no adverse signal and no value within 5% of its threshold:
        → AUTO_APPROVED        (issue letter)

elif any rule PASS but (low confidence | near-threshold | adverse news
   | internal inconsistency | extractor disagreement*):
        → NEEDS_REVIEW         (queue for human, with the specific reason)

   * extractor disagreement only applies if §9's optional cross-check is wired

elif all rules have sufficient data and all FAIL:
        → REJECTED

else:
        → NEEDS_DOCUMENTS      (name the missing fields)
```

Near-threshold deliberately routes to a human: an investor at $201K income is exactly where a wrong auto-approval costs the issuer its exemption.

---

## 8. API Contract — freeze in the first 20 minutes

Frontend builds against a mock of this immediately and is never blocked.

```
POST   /cases                   {subject_type, claimed_path, commitment_usd}   → {case_id}
POST   /cases/{id}/documents    multipart file                                 → {doc_id, doc_type}
POST   /cases/{id}/run                                                         → SSE stream of stage events
GET    /cases/{id}                                                             → full Case
GET    /cases                                                                  → [case summaries]   (GP dashboard)
GET    /cases/{id}/letter                                                      → {letter_md, trace_url}
```

`POST /run` streams `{stage, status, detail}` events so the UI can light stages up live — that progression is the demo's visual payload. If SSE costs more than 20 minutes, degrade to polling `GET /cases/{id}`.

---

## 9. The Swappable Extractor (second engineer's parser)

```python
class DocumentExtractor(Protocol):
    def extract(self, doc: Document, doc_type: str) -> dict[str, Field]: ...
```

- **`NicrronExtractor`** — ours, ships tonight, is the demo path
- **`DeterministicExtractor`** — his parser, optional, slots in with zero changes anywhere else

**Opportunistic upgrade if his parser lands and works** (~20 lines, do not build speculatively): run both extractors and cross-check. Agreement on a field raises its confidence; disagreement forces `NEEDS_REVIEW`. Two independent extractions corroborating each other is a genuine compliance feature — and it gives his work a home without ever putting it on the critical path.

---

## 10. Demo Script

Four fixture cases, chosen so that each one *forces* a different tool to do real work:

| # | Case | Exercises | Outcome |
|---|---|---|---|
| 1 | Clean individual, income path — 2× W-2 + 1040 | Nicrron, PRISM, Roundtable | `AUTO_APPROVED` + letter in <60s |
| 2 | Individual claiming Series 65 | **Solari** → BrokerCheck screenshot | `AUTO_APPROVED` on license test |
| 3 | Entity LP (LLC) subscribing | **akta.pro** → firmographics + adverse news | `NEEDS_REVIEW`, shell-risk flagged |
| 4 | **Doctored bank statement** | Nicrron confidence drop + inconsistency | `NEEDS_REVIEW` with logged reason |

Case 4 is the memorable beat — the system catching something — and it costs nothing but a bad fixture. Close on the PRISM trace for case 1: *"this is what preserves your exemption."*

---

## 11. Risk Register

Four of five SDKs are unverified. Each gets a timebox and a predefined fallback; **when the timebox expires, take the fallback and move on** — this discipline is what saves the demo.

| Risk | Timebox | Fallback |
|---|---|---|
| Solari computer-use too slow/flaky | 15 min spike, early | Pre-cached result + screenshot; optionally a recorded clip of a live run |
| Nicrron vision/structured-output unsupported | 20 min | Accept pasted document *text* alongside image upload; text extraction only |
| Roundtable SDK unfamiliar | 30 min | `LocalJsonStore` (already shipping); show whatever versions did land |
| akta.pro signup friction (Stripe + `DEALFLOW50`) | do first | Cached responses for the two demo companies |
| PRISM SDK fights us | 25 min | Raw OTel exporter, or local structured audit log rendered in-app |
| Venue WiFi collapses | — | **Every** external call cached; full demo runs offline. Pangea backup WiFi |
| Credits expire 11:59 PM ET | — | Redeem all codes before writing code |

---

## 12. Build Sequence

| Time | Work |
|---|---|
| 0:00–0:30 | Redeem all 5 codes (split across the team). Freeze API contract, push skeleton, serve mock responses |
| 0:30–1:15 | FastAPI skeleton + `Case` state machine + **PRISM tracing wired first** |
| 1:15–1:30 | **Solari feasibility spike** — can a cloud browser load BrokerCheck at all? Decide live-vs-recorded now, while there's still time to adapt |
| 1:30–2:45 | Nicrron: classify + extract with confidence and source quotes (the deep one) |
| 2:45–3:30 | Rules engine + triage logic |
| 3:30–4:00 | Solari full wiring + cache |
| 4:00–4:30 | akta.pro entity path |
| 4:30–5:00 | Roundtable case file + handoff messages |
| 5:00–5:30 | Letter generation + audit-file view |
| 5:30–6:00 | Fixtures, cache everything, rehearse, run the WiFi-down drill |

Frontend runs in parallel against the frozen contract the entire time.

---

## 13. Open Questions

1. **Frontend stack** — teammate's choice; contract is plain JSON either way
2. **Do the organizers require meeting each sponsor's *own* qualification rules?** If yes, skipping the Ninoo Builder is a problem and needs a ruling from them early
3. **Fixture documents** — need realistic synthetic W-2/1040/bank statements; clearly watermarked synthetic, never real investor data
4. **Demo identity for BrokerCheck** — must be a real public CRD record for the lookup to return anything

---

*Not legal advice. Thresholds and citations follow `plan.md`; confirm with securities counsel before any real use.*
