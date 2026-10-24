# Accredited Investor Verification — Hackathon Build Spec

*Deal Flow @ Betaworks · October 24, 2026 · judging tonight*

Product research and market context: [`plan.md`](../../../plan.md). Sponsor resources: [`resources.md`](../../../resources.md).

---

## 1. What We're Building

A verification service where **two independent AI agents from different vendors read an investor's documents, adversarially review each other's work, and converge on a recommendation** — backstopped by a deterministic validator that confirms the statutory arithmetic. Output: either an auto-approval with a letter, or a flagged case for human review, with a complete timestamped record of the debate and every decision.

**The pitch, in one line:** the product is not document-reading AI, it's *liability protection*. Per `plan.md` §11, a documented "reasonable steps" process preserves the issuer's Reg D exemption even if the investor lied. The debate transcript plus the validator check **is** the product.

**Why two agents from different vendors:** the same model run twice shares its blind spots — it fails identically and the "review" is a rubber stamp. Cross-vendor review is genuine independence. This is also what makes Nicrron load-bearing rather than a convenient gateway.

**Demo win condition:** a judge watches two agents disagree about a document, watch them resolve it, watch a doctored document get caught, and then sees the audit trail that makes the whole thing defensible.

---

## 2. Hard Constraints

| Constraint | Consequence |
|---|---|
| Judging tonight (~6 hrs build) | Core must be small; every integration needs a fallback |
| All 5 sponsor tools must be integrated (organizer rule) | 3 deep (Nicrron, Roundtable, PRISM), 2 thin-but-real (akta.pro, Solari) |
| One engineer (Apoorv) owns core + all 5 integrations | Thin integrations are one call each, behind a uniform adapter |
| Frontend teammate works in parallel | API contract frozen in first 20 minutes, mock served immediately |
| Second backend engineer's deterministic parser is a *maybe* | Becomes the validator layer if it lands; never on the critical path |
| Nicrron credits expire 11:59 PM ET today | Redeem first, before any code |
| No Ninoo Builder (user decision) | Forfeits the NicrronNinoo-specific prize track; Nicrron API still satisfies "used the sponsor" |

**Cost is a non-constraint.** `openai/gpt-6-luna` is $0.10/1M prompt tokens — a 5-round debate per document costs a fraction of a cent. With $260 of credit, model calls are effectively free, so the design optimizes for *quality of judgment*, not call count.

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

```
INTAKE → EXTRACT (agent debate) → ENRICH → ADJUDICATE → VALIDATE → TRIAGE → ISSUE
   │              │                  │          │           │         │        │
   │              │                  │          │           │         │        └─ letter      (Nicrron)
   │              │                  │          │           │         └────────── routing     (deterministic)
   │              │                  │          │           └──────────────────── 501(a) math (deterministic)
   │              │                  │          └──────────────────────────────── final fields + recommendation
   │              │                  └─────────────────────────────────────────── BrokerCheck / company
   │              │                                                                  (Solari, akta.pro)
   │              └────────────────────────────────────────────────────────────── 2 agents, 2 vendors, 3 rounds
   └───────────────────────────────────────────────────────────────────────────── form + uploads

   debate happens in ──► Roundtable thread (deep)
   every step traced ──► PRISM span tree (deep)
```

### Domain model

```python
Case:
    case_id:        str
    subject_type:   "individual" | "entity"
    claimed_path:   "income" | "net_worth" | "license" | "entity_assets" | "min_investment"
    commitment_usd: int | None
    documents:      list[Document]
    debate:         list[DebateTurn]     # (round, actor, model, content, challenges, resolutions)
    extracted:      dict[str, Field]     # Field = {value, confidence, source_quote, doc_id, disputed}
    evidence:       dict[str, Any]       # external checks (Solari, akta.pro)
    recommendation: AgentRecommendation  # adjudicator's verdict + trust assessment + reasoning
    validation:     list[RuleResult]     # deterministic 501(a) checks
    conflict:       bool                 # recommendation disagrees with validation
    decision:       "auto_approved" | "needs_review" | "rejected" | "needs_documents"
    audit_trail:    list[AuditEvent]
    letter_md:      str | None
```

**Core invariant:** `decision` requires the adjudicator's recommendation **and** the validator to agree. Any conflict routes to `needs_review` — neither layer can auto-approve alone.

---

## 5. Integration Map — Exactly Where Each Tool Is Called

### 5.1 Nicrron API — DEEP (the debate engine)

Base URL `https://api.nicrron.ai/v1`, OpenAI-compatible. The multi-model catalog behind one key is what makes cross-vendor adversarial review possible at all.

**The debate protocol** (per document):

| Round | Actor | Model | Produces |
|---|---|---|---|
| 1 | **Extractor** | `openai/gpt-6-luna` | fields + confidence + `source_quote` each |
| 2 | **Challenger** | `anthropic/claude-sonnet-5` *(different vendor — required)* | zero or more specific challenges |
| 3 | **Extractor** | `openai/gpt-6-luna` | per challenge: `CONCEDE` (revised value) or `DEFEND` (cite quote) |
| 4 | **Adjudicator** | `openai/gpt-6-astra` | final field set, trust assessment, recommended decision + reasoning |

Round 2 is prompted with **named failure modes**, not generic doubt — a vague "review this" reliably returns "looks fine," which is worse than no review:

- misread or transposed digits
- wrong field pulled (AGI vs. total income vs. wages)
- stale or wrong tax year
- cross-document inconsistency (W-2 employer ≠ 1040; balance ≠ statement period)
- arithmetic that doesn't add up on the face of the document
- signs of alteration (font/alignment mismatch, impossible totals)
- unsupported inference (a field the document never states)

Each challenge must name the field and the reason. Astra appears exactly once, where capability actually pays; everything else runs on luna at $0.10/1M.

**Also on Nicrron:**
- **Document classification** · `openai/gpt-6-luna` → `w2 | 1040 | bank_statement | brokerage_statement | cpa_letter | trust_deed | unknown`, so the investor never declares what they uploaded
- **Letter prose** · `openai/gpt-6-astra` → receives the *already-settled* decision and writes prose around fixed figures

**Open risk:** modality support for `gpt-6-luna` is unconfirmed. If it's text-only, either the extractor moves to a vision-capable model or we accept pasted document text. **10-minute check, on the critical path.**

### 5.2 Roundtable — DEEP (the debate venue and system of record)

The debate runs **in a Roundtable thread** — this is agent-to-agent communication, which is exactly what the platform exists for. Each round is a real message from a named agent; challenges and concessions are replies.

Two things come free and both are genuine compliance artifacts:
- **The thread** is the deliberation record — who challenged what, who conceded, what stayed disputed
- **Case-file version history** — one version per stage: v1 intake → v2 debate → v3 enriched → v4 adjudicated → v5 validated → v6 issued

**Risk control:** this is the SDK we've never opened, so the debate loop is built as **plain function calls first**, with Roundtable as the venue layered on top. If the SDK fights us, the debate still runs and is logged locally — we lose the workspace view, not the architecture.

```python
class DebateVenue(Protocol):
    def open_thread(self, case_id: str) -> str: ...
    def post_turn(self, thread: str, actor: str, model: str, content: dict) -> None: ...
    def save_version(self, case: Case, stage: str) -> str: ...
```
`LocalJsonVenue` ships first and always works; `RoundtableVenue` swaps in.

### 5.3 PRISM — DEEP (the audit trail)

`pip install prismtrace-sdk` (or OTel exporter), key in `PRISMTRACE_API_KEY`. Wire this **first** — retrofitting tracing is miserable.

Tracing a *debate* is far richer audit material than tracing a single extraction:

```
case:{case_id}                                  root
├── stage:extract
│   ├── debate.round1.extract    model, field_count, min_confidence
│   ├── debate.round2.challenge  model, challenge_count, fields_challenged
│   ├── debate.round3.respond    model, conceded, defended
│   └── debate.round4.adjudicate model, recommendation, disputes_open
├── stage:enrich
│   ├── solari.brokercheck       target, license_found, screenshot_url, cache_hit
│   └── akta.company_enrich      company, headcount, adverse_news, cache_hit
├── stage:validate
│   └── rule:{rule_id}           outcome, inputs_used, citation   ← one span per rule
├── stage:triage                 decision, conflict, reason
└── stage:issue                  letter_len
```

This span tree *is* the §11 audit file. On stage: open a verification, click into the trace, show that two independent models reviewed it, what they disagreed on, and that a deterministic check confirmed the arithmetic against the statute.

**Stretch (bonus track only, if the demo is already safe):** a PRISM guardrail for *"no case reaches `ISSUE` with `conflict == true`"*, then show v1 violating it and v2 not.

### 5.4 akta.pro — THIN (one call site, entity cases only)

Fires at `ENRICH` **only when `subject_type == "entity"`.** Endpoints (confirmed from `docs.akta.pro/llms.txt`):
1. **Company Search** — resolve entity by name or domain → UUID
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
Fed to the adjudicator as context and to a `SHELL_COMPANY_RISK` check that can route to `needs_review` — it can **never** produce an accreditation pass. The API has no individual-level or AUM data (verified), so overclaiming here would be wrong. UI labels the panel *"Entity corroboration — not a verification source."*

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

## 6. The Validator (deterministic backstop)

Not the decider — the backstop. Roughly 40 lines of threshold comparisons over the adjudicator's final field set.

**Why it stays, given the agents decide:**
- "An AI said yes" is a weak defense of a Reg D exemption. "Two independent models agreed and a deterministic check confirmed the arithmetic against the statute" is a strong one. It's the cheapest credibility available.
- `INCOME` is specifically where confident models slip: *≥$200K in **each** of the last two years **plus** a reasonable expectation for the current year* is multi-condition temporal logic. Free to verify.
- It **stabilizes the demo.** Two agents debating produce a different transcript every run; the validator keeps the *outcome* deterministic even when the conversation varies.

```python
RuleResult:
    rule_id:     str
    citation:    str                      # e.g. "17 CFR 230.501(a)(6)"
    outcome:     "PASS" | "FAIL" | "INSUFFICIENT_DATA"
    inputs_used: dict[str, Any]
    reason:      str
```

| `rule_id` | Citation | Test |
|---|---|---|
| `INCOME` | 501(a)(6) | ≥$200K individual (≥$300K joint) in **each** of the last 2 years + reasonable expectation for current year |
| `NET_WORTH` | 501(a)(5) | Net worth >$1M **excluding primary residence**; flag mortgage debt added in last 60 days |
| `LICENSE` | 501(a)(10) | Series 7, 65, or 82 in good standing (from Solari evidence) |
| `ENTITY_ASSETS` | 501(a)(3)/(9) | Entity with >$5M total assets or >$5M investments |
| `MIN_INVESTMENT` | Mar 2025 SEC no-action letter | Commitment ≥$200K individual / ≥$1M entity + self-cert funds not third-party financed |

Plus `SHELL_COMPANY_RISK` (entity cases, from akta.pro evidence) — routes to review only, never passes or fails accreditation.

**If the second engineer's deterministic parser lands and works, it slots in here** as an independent field-extraction cross-check: agreement with the agents' final fields raises confidence, disagreement sets `conflict = true`. Same interface, zero changes elsewhere, never on the critical path.

---

## 7. Triage Logic

```
if recommendation == APPROVE and validator has ≥1 PASS and not conflict
   and all inputs_used confidence ≥ 0.85
   and no open disputes and no adverse signal
   and no value within 5% of its threshold:
        → AUTO_APPROVED        (issue letter)

elif conflict:                                     # the money shot
        → NEEDS_REVIEW         ("agents recommended approve; $199,400 fails 501(a)(6)")

elif open disputes | low confidence | near-threshold | adverse news:
        → NEEDS_REVIEW         (with the specific reason)

elif all rules have sufficient data and all FAIL:
        → REJECTED

else:
        → NEEDS_DOCUMENTS      (name the missing fields)
```

Near-threshold deliberately routes to a human: an investor at $201K income is exactly where a wrong auto-approval costs the issuer its exemption. Produces `plan.md` §4's 70/20/10 split.

---

## 8. API Contract — freeze in the first 20 minutes

Frontend builds against a mock of this immediately and is never blocked.

```
POST   /cases                   {subject_type, claimed_path, commitment_usd}   → {case_id}
POST   /cases/{id}/documents    multipart file                                 → {doc_id, doc_type}
POST   /cases/{id}/run                                                         → SSE stream
GET    /cases/{id}                                                             → full Case (incl. debate)
GET    /cases                                                                  → [case summaries]
GET    /cases/{id}/letter                                                      → {letter_md, trace_url}
```

`POST /run` streams `{stage, round, actor, status, detail}` so the UI can render **the debate turn by turn as it happens** — two agents arguing in real time is the demo's visual payload. If SSE costs more than 20 minutes, degrade to polling.

---

## 9. Demo Script

Five fixture cases, each forcing a different tool to do real work:

| # | Case | Exercises | Outcome |
|---|---|---|---|
| 1 | Clean individual, income path — 2× W-2 + 1040 | Nicrron debate, Roundtable, PRISM | `AUTO_APPROVED` + letter |
| 2 | Individual claiming Series 65 | **Solari** → BrokerCheck screenshot | `AUTO_APPROVED` on license test |
| 3 | Entity LP (LLC) subscribing | **akta.pro** → firmographics + adverse news | `NEEDS_REVIEW`, shell risk flagged |
| 4 | **Doctored bank statement** | Challenger catches alteration in round 2 | `NEEDS_REVIEW`, caught by the debate |
| 5 | **$199,400 income** | Agents recommend approve; validator fails it | `NEEDS_REVIEW` — **conflict surfaced** |

Cases 4 and 5 are the memorable beats and both cost nothing but a fixture. Case 5 is the strongest: it shows the two layers checking each other. Close on the PRISM trace: *"this is what preserves your exemption."*

---

## 10. Risk Register

Four of five SDKs are unverified. Each gets a timebox and a predefined fallback; **when the timebox expires, take the fallback and move on** — this discipline is what saves the demo.

| Risk | Timebox | Fallback |
|---|---|---|
| `gpt-6-luna` can't read images | 10 min, early | Vision-capable model for extraction, or accept pasted text |
| Solari computer-use too slow/flaky | 15 min spike, early | Pre-cached result + screenshot; optionally a recorded clip |
| Roundtable SDK unfamiliar | 30 min | `LocalJsonVenue` (already shipping); debate still runs |
| Debate too slow for a live demo | — | Cache completed debates for fixtures; stream from cache |
| Debate outcome varies run to run | — | Validator stabilizes the *outcome*; cache fixture runs |
| akta.pro signup friction (Stripe + `DEALFLOW50`) | do first | Cached responses for the two demo companies |
| PRISM SDK fights us | 25 min | Raw OTel exporter, or local structured audit log rendered in-app |
| Venue WiFi collapses | — | **Every** external call cached; full demo runs offline. Pangea backup |
| Credits expire 11:59 PM ET | — | Redeem all codes before writing code |

---

## 11. Build Sequence

| Time | Work |
|---|---|
| 0:00–0:30 | Redeem all 5 codes (split across team). Freeze API contract, push skeleton, serve mocks |
| 0:30–1:00 | FastAPI skeleton + `Case` state machine + **PRISM tracing wired first** |
| 1:00–1:10 | **Luna modality check** — does it accept images? Decide extractor model now |
| 1:10–1:25 | **Solari feasibility spike** — can a cloud browser load BrokerCheck at all? Decide live-vs-recorded while there's time to adapt |
| 1:25–3:00 | **The debate loop** — 4 rounds, 2 vendors, named failure modes, local function calls first |
| 3:00–3:30 | Validator + triage + conflict detection |
| 3:30–4:00 | Roundtable as debate venue + case-file versions |
| 4:00–4:30 | Solari full wiring + cache |
| 4:30–4:50 | akta.pro entity path |
| 4:50–5:20 | Letter generation + audit-file view |
| 5:20–6:00 | Fixtures (esp. cases 4 and 5), cache everything, rehearse, WiFi-down drill |

Frontend runs in parallel against the frozen contract the entire time.

---

## 12. Open Questions

1. **Frontend stack** — teammate's choice; contract is plain JSON either way
2. **Challenger vendor** — `anthropic/claude-sonnet-5` (stronger) vs `deepseek/deepseek-v4-flash` (cheaper); only requirement is *not OpenAI*, so the review is genuinely independent
3. **Do the organizers require meeting each sponsor's *own* qualification rules?** If yes, skipping the Ninoo Builder is a problem — get a ruling in hour one
4. **Fixture documents** — realistic synthetic W-2/1040/bank statements, clearly watermarked synthetic, never real investor data
5. **Demo identity for BrokerCheck** — must be a real public CRD record for the lookup to return anything

---

*Not legal advice. Thresholds and citations follow `plan.md`; confirm with securities counsel before any real use.*
