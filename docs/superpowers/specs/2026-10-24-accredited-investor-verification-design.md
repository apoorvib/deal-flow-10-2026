# Savy — Backend Design Spec

*Deal Flow @ Betaworks · October 24, 2026 · judging tonight*

**Read this first if you are picking up this repo cold.** It is the authoritative description of the backend. Market research: [`plan.md`](../../../plan.md). Sponsor tools: [`resources.md`](../../../resources.md). Task sequence: [`../plans/2026-10-24-accredited-investor-verification.md`](../plans/2026-10-24-accredited-investor-verification.md).

---

## 1. What Savy Is

An LP gets verified as an accredited investor **once**, then shares a reusable 90-day **passport** with any number of funds. That is `plan.md` §5's attack on iCapital's Investor Passport, aimed at the segment iCapital underserves.

**Customer:** 506(c) issuers — syndicates, SPVs, rolling funds, and real-estate sponsors (`plan.md` §10, pain 4–5). **Not** "small VC funds": most VC funds raise under 506(b), which requires no verification at all, and 506(c) is only ~7% of Reg D (`plan.md` §8). Claiming VC funds invites a correct and deflating objection from anyone who knows private markets.

**The product is liability protection.** Per `plan.md` §11, a documented, proper process **generally** preserves the issuer's Reg D exemption even if the investor lied. Do not harden "generally" into "always." The audit trail is the product; the AI is how we produce it cheaply.

**What makes it defensible:** two independent AI models from different vendors read the investor's documents and adversarially review each other, then a deterministic rules engine confirms the statutory arithmetic. "An AI said yes" is a weak defense of an exemption. "Two independent models agreed, a deterministic check confirmed the thresholds against the statute, and here is the timestamped trace" is a strong one.

---

## 2. The Frontend Already Exists — The Contract Is Fixed

A React/TypeScript app (Vite, React 19, Tailwind v4) is built and working against a mock. **The backend conforms to the frontend, not the other way round.**

| Source of truth | What it defines |
|---|---|
| **`src/lib/types.ts`** | Every entity on the wire. **Authoritative.** Read it before writing any model. |
| **`src/lib/api/client.ts`** | The `Api` interface and every HTTP route. |
| **`src/lib/api/mock.ts`** | A complete working reference implementation. `fakeEvaluate()` is the behavior to replicate — with real logic behind it. |
| **`src/lib/rules.ts`** | Thresholds, and `estimateNetWorth()` — **use its formula verbatim**. |
| **`README.md`** | The route table. |

### Routes (exact)

| Method | Route | Body | Returns |
|---|---|---|---|
| POST | `/kyc` | `{legalName, scenario?}` | `KycSession` |
| POST | `/account-links` | `{scenario?}` | `AccountLink` |
| POST | `/documents` | multipart `file` | `ParsedDocument` |
| POST | `/licenses/check` | `{type, crd}` | `{found, name}` |
| POST | `/verifications` | `ApplicationInput` | `Verification` |
| GET | `/verifications/:id` | | `Verification` |
| POST | `/verifications/:id/sign-off` | | `Verification` |
| GET | `/passports/:id` | | `{passport, active}` |
| POST | `/passports/lookup` | `{email, letterRef}` | `{passportId}` or `null` |
| GET | `/funds` | | `Fund[]` |
| GET | `/passports/:id/shares` | | `Share[]` |
| POST | `/passports/:id/shares` | `{fundId}` | `Share` |
| DELETE | `/passports/:id/shares/:shareId` | | — |

### Non-negotiable wire details

- **JSON is camelCase** (`legalName`, `investorType`, `priorYear1`, `docType`). Pydantic models must serialize camelCase — use `alias_generator=to_camel` with `populate_by_name=True`, or name the fields camelCase directly.
- **Errors are `{"error": "message"}`** with a real HTTP status. A FastAPI `HTTPException` returns `{"detail": ...}` by default — **add an exception handler** or the UI shows nothing useful.
- **`credentials: 'include'`** means CORS **cannot** use `allow_origins=["*"]`. Browsers reject a wildcard with credentials. Set the explicit Vite origin: `allow_origins=["http://localhost:5173"]`, `allow_credentials=True`.
- **`reviewConfidence = 0.9`.** Documents read below 0.9 confidence, or carrying any flag, escalate to `review`.
- **Freshness / passport validity: 90 days.**
- **Sandbox scenarios must be honored:** `startKyc` takes `'clean' | 'ofac' | 'fail'`; `linkAccounts` takes `'high' | 'low'`. A CRD beginning with `9` must return `found: false` — the UI documents this as its license-failure demo path.
- **The client never sends figures for a document.** It uploads a file, gets an id, and references the id. All extracted values live server-side.

### Decision and check vocabulary (exact)

`Decision = 'approved' | 'review' | 'needs_info' | 'denied'` — escalation ranks in that order, and the worst check wins.

`CheckResult = 'pass' | 'fail' | 'warn'`. Every `Check` is `{id, label, result, detail}`. `Evaluation` is `{decision, checks, reasons}`, where `reasons` are plain-language strings shown to the LP only when not approved.

---

## 3. Architecture

```
POST /documents ──► classify ──► DEBATE (2 vendors, 4 rounds) ──► ParsedDocument
                                   │                                 {income, balance,
                                   │                                  confidence, flags[],
                                   │                                  summary}
                                   └─ challenger findings land in flags[]

POST /verifications ──► EVIDENCE ──► EVALUATE ──► DECIDE ──► ISSUE
                           │            │            │          │
                           │            │            │          └─ Passport + letterRef
                           │            │            └─ worst check wins
                           │            └─ deterministic Rule 501(a) checks
                           └─ license (Solari) · entity (akta.pro) · KYC · account links

every step ──► PRISM span   ·   debate + verification file ──► Roundtable
```

Documents are parsed at **upload** time, not at submit time, because the UI shows per-document results in its evidence step. The verification endpoint consumes already-parsed documents by id.

### Where AI decides and where it must not

| Judgment | Owner | Why |
|---|---|---|
| What a document says; is it internally consistent; is it trustworthy | **AI debate** | Genuine judgment. Messy documents, cross-document consistency, suspicious arithmetic. |
| Does $214,500 ≥ $200,000; is each of two years above threshold; net worth arithmetic | **Deterministic** | No judgment exists here. A comparison operator is not a weaker tool than an LLM — it is a stronger one. |
| Final `decision` | **Deterministic** | Escalation over checks. The model's recommendation is an input, never the output. |

**Core invariant:** a `decision` of `approved` requires the deterministic checks to pass **and** no unresolved agent/validator disagreement. Neither layer can approve alone.

---

## 4. Integration Map — Exactly Where Each Sponsor Is Called

All five are required by the organizers. Two are deep; three make real calls at one site each, with a cached fallback so the demo survives a dead network.

### 4.1 Nicrron API — DEEP (document understanding)

Base URL `https://api.nicrron.ai/v1`, OpenAI-compatible. The multi-vendor catalog behind one key is what makes cross-vendor adversarial review possible at all.

Called from `POST /documents`. One debate per upload, four rounds:

| Round | Actor | Model | Produces |
|---|---|---|---|
| 0 | Classifier | `openai/gpt-6-luna` | `docType` |
| 1 | Extractor | `openai/gpt-6-luna` | fields + confidence + source quotes |
| 2 | **Challenger** | `anthropic/claude-sonnet-5` — **must not be OpenAI** | specific challenges |
| 3 | Extractor | `openai/gpt-6-luna` | per challenge: CONCEDE or DEFEND |
| 4 | Adjudicator | `openai/gpt-6-astra` | final fields, trust assessment, `flags[]` |

Round 2 is prompted with **named failure modes**, never generic doubt — a vague "review this" reliably returns "looks fine," which is worse than no review:

`misread_or_transposed_digits`, `wrong_field` (AGI vs total income vs wages), `stale_or_wrong_tax_year`, `cross_document_inconsistency`, `face_arithmetic_error`, `impossible_dates`, `unsupported_inference`. Plus `signs_of_alteration` **only if vision works** — see §6.

**The output maps directly onto `ParsedDocument`:** unresolved challenges become `flags[]`, the adjudicator's confidence becomes `confidence`, and anything below 0.9 or any flag escalates the verification to `review`. The contract already had a home for adversarial findings.

Also used for `summary` prose. Cost is a non-constraint: luna is $0.10/1M prompt tokens, so a four-round debate is a fraction of a cent.

### 4.2 PRISM — DEEP (the audit trail)

`prismtrace-sdk` or an OTel exporter, key in `PRISMTRACE_API_KEY`. Wire it **before** there is anything to retrofit.

```
verification:{id}
├── document:{id}
│   ├── debate.round1.extract      model, field_count, min_confidence
│   ├── debate.round2.challenge    model, challenge_count, fields_challenged
│   ├── debate.round3.respond      model, conceded, defended
│   └── debate.round4.adjudicate   model, confidence, flags
├── evidence
│   ├── solari.brokercheck         crd, found, screenshot_url, cache_hit
│   ├── akta.company_enrich        company, headcount, adverse_news, cache_hit
│   ├── kyc                        status, ofacHit
│   └── account_links              account_count, total_balance
├── check:{check_id}               result, detail, inputs_used, citation
├── decide                         decision, escalated_by, conflict
└── issue                          letterRef, expiresAt
```

This span tree **is** the §11 audit file. Tracing a *debate* is far richer than tracing one extraction: you can show which model challenged what, and what the deterministic layer then confirmed.

**Guardrail (the PRISM challenge track):** the invariant *no verification may be issued a passport while a check has `result: 'fail'` or an unresolved agent/validator conflict exists* is enforced in code **and** mirrored as a PRISM rule via MCP. Demonstrate v1 violating it and v2 not, on identical inputs. This is the same logic the decision engine already needs, so it costs almost nothing extra.

**Provisioning order matters:** the `DEALFLOW` credit is redeemed only *after* a first trace lands. One workspace per team — the owner invites everyone else; a second independent signup splits the team.

### 4.3 Roundtable — DEEP-ish (debate venue and system of record)

The debate runs **in a Roundtable thread** — genuine agent-to-agent communication, which is what the platform is for. Each round is a message from a named agent; challenges and concessions are replies. The `Verification` is also written as a versioned file, one version per stage, which is a real compliance artifact (an immutable deliberation record).

**Risk control:** the debate is built as plain function calls first, with Roundtable layered on as the venue. Behind `DebateVenue`, `LocalJsonVenue` ships first and always works. If the SDK fights us, the debate still runs and is logged — we lose the workspace view, not the architecture.

### 4.4 akta.pro — THIN (entity corroboration only)

Fires during `POST /verifications` **only when `investorType == 'entity'`**. Endpoints confirmed from `docs.akta.pro/llms.txt`: Company Search → Company Data → News Signals.

**Verified scope limit:** akta.pro holds **company/organization data only** — firmographics, headcount, funding, traffic, jobs, news. It has **no individual-level data**: no identity, KYC, net worth, income, or accreditation status, and no AUM. It therefore **cannot** establish accredited status for anyone. It produces one `Check` that can `warn` → escalate to `review`, never a `pass` on accreditation. Label it honestly in `detail`: corroboration, not verification. Judges who know this space will respect the accuracy more than an overclaim.

Used for: does this entity resolve to a real operating business, or does it look like a shell? Any adverse news?

### 4.5 Solari — THIN (FINRA BrokerCheck)

Fires from `POST /licenses/check`, and again as a `Check` during evaluation on the `license` pathway. A scripted cloud browser against FINRA BrokerCheck, which has **no usable public API** (`plan.md` §14) — so a computer-use agent is genuinely the right tool here, not a gimmick.

**The screenshot is the deliverable.** A timestamped capture of the regulator's own page is documented "reasonable steps" — it belongs in the audit file and on screen during the demo.

Highest-risk integration: computer-use is slow, flaky, and network-dependent. Controls: a 15-minute feasibility spike early; a hard timeout; pre-cached results for the demo CRDs; live attempts fall back to cache silently. Preserve the UI's contract that a CRD starting with `9` returns `found: false`.

### 4.6 Persona and Plaid are mocked, deliberately

`KycSession` and `AccountLink` are typed "Persona in production, mocked for now" and "Plaid in production, mocked for now." The backend implements both as deterministic stubs that honor the sandbox `scenario` parameter. Real Plaid production access takes weeks (`plan.md` §14) and real KYC is orthogonal to the accreditation story — both are out of scope tonight and that is the right call, not a gap.

---

## 5. The Evaluation Engine

Replicates `fakeEvaluate()` in `src/lib/api/mock.ts` with real logic behind it. Every check carries a statutory citation in `detail` where one exists.

**Always run:** `identity` (KYC), `sanctions` (OFAC/PEP → `warn` escalates to `review`), one `doc_{id}` check per document (confidence < 0.9 or any flag → `warn` → `review`), `attest` (accuracy + consent).

**Per pathway — one of:**

| Pathway | Citation | Test |
|---|---|---|
| `income` | 501(a)(6) | ≥$200K individual / ≥$300K joint in **each** of the last two years, plus an expectation for the current year. A two-year average does **not** qualify. |
| `net_worth` | 501(a)(5) | Net worth >$1M excluding the primary residence. **Use `estimateNetWorth()` from `src/lib/rules.ts` verbatim:** the home is excluded entirely, and its mortgage counts as a liability only to the extent it is underwater *or* was increased in the last 60 days — `liabilities + max(underwater, recentIncrease)`. |
| `license` | 501(a)(10) | Active Series 7, 65, or 82 per BrokerCheck (Solari). |
| `min_investment` | Mar 2025 SEC no-action letter | Commitment ≥$200K individual / ≥$1M entity, plus the written self-certification that funds are not third-party financed. |
| `entity_assets` | 501(a)(3)/(9) | Entity holds >$5M. If `formedForPurpose` is true → `warn` → `review`, because owners need look-through. |

**Plus:** `income_{year}` document-coverage checks for each of the two prior years; `assets_verified` and `liabilities` for net worth; `trust` look-through when `entityKind == 'trust'`; `entity_corroboration` for entities (akta.pro).

### The improvement over the mock: self-reported vs. extracted

The mock evaluates the LP's **self-reported** `IncomeEvidence` and separately checks that *some* tax document exists for each year. The real backend **cross-checks the two**: the LP says `priorYear1 = 240000`, the debate read `185000` from the 2024 W-2. That disagreement becomes a `warn` check → `review`.

This is where the AI layer earns its place, and it is native to the contract rather than bolted on. It is also the demo's centerpiece (§7, case 5).

---

## 6. Vision Is Probably Unavailable — Assume Text

Every model in the live Nicrron catalog reports modality `chat`; none advertises image input. Until proven otherwise:

- Documents are processed as **text** (extracted from the uploaded file, or pasted).
- `signs_of_alteration` is **removed** from the challenger's failure modes. Left in on a text-only path, it invites the model to invent visual evidence it cannot have.
- Forgery fixtures must be caught **arithmetically** — totals that do not reconcile, a generation date preceding the period it reports — not by font or alignment.

A 10-minute probe is the first API call of the night. If vision does work, set `VISION_ENABLED=1` and `signs_of_alteration` returns.

---

## 7. Demo Script

Five cases, each forcing a different sponsor to do real work:

| # | Case | Exercises | Expected |
|---|---|---|---|
| 1 | Clean individual, income — 2× W-2 + 1040 | Nicrron debate, PRISM, Roundtable | `approved` + passport issued |
| 2 | Series 65 holder (real public CRD) | **Solari** → BrokerCheck screenshot | `approved` on the license test |
| 3 | Entity LLC, `entity_assets` | **akta.pro** → shell/adverse-news signal | `review` |
| 4 | Doctored bank statement (arithmetic forgery) | Challenger catches it in round 2 → `flags[]` | `review` |
| 5 | **Self-reported income contradicts the documents** | The whole architecture at once | `review` — **conflict surfaced** |
| — | Then: share the passport with a fund, revoke it | Passport + shares flow | the reuse story |

**Case 5 is the showpiece.** LP reports $240K for both prior years; the 2024 W-2 reads $185K. Agents may well approve by averaging or by reading the wrong line — the deterministic check fails on "each of the last two years," and the cross-check flags the contradiction. $185K is 7.5% below threshold, comfortably outside any near-threshold band, so the conflict fires cleanly instead of being masked by a boring reason. It survives a judge saying "re-run it."

**Case 2 ethics:** the license pathway needs no financial documents, so case 2 carries only that real person's real public license data and asserts nothing financial about them. Never bind a real named individual's regulatory record to synthetic financials. Best option: a consenting teammate who holds a CRD.

Close on the PRISM trace for case 1: *this is the documented process that supports the issuer's reasonable-belief position.*

---

## 8. Risk Register

Four of five SDKs have never been run by this team. Each gets a timebox and a predefined fallback; **when the box expires, take the fallback and move on.**

| Risk | Timebox | Fallback |
|---|---|---|
| No model reads images | 10 min, first | Text-only path; arithmetic forgery; drop `signs_of_alteration` |
| Solari too slow or unreachable | 15 min spike, early | Pre-cached result + screenshot; optionally a recorded clip |
| Roundtable SDK unfamiliar | 30 min | `LocalJsonVenue`; the debate still runs |
| Debate too slow for a live demo | — | Pre-seed the demo cases; one live run as the honesty beat |
| akta.pro signup friction (Stripe + `DEALFLOW50`) | do first | Cached responses for the demo entities |
| PRISM SDK fights us | 25 min | Raw OTel exporter, or a local structured audit log |
| Venue WiFi collapses | — | **Every** external call cached; the full demo runs offline. Pangea backup |
| Nicrron credits expire 11:59 PM ET today | — | Redeem before writing code |
| CORS/credentials or camelCase mismatch | — | Verify against the real UI early — these silently break everything |

---

## 9. Open Questions

1. **Do the organizers require meeting each sponsor's *own* qualification rules?** `ninoo.md` says "Three rules. Miss any one of them and your entry is disqualified," one of which is building in the Ninoo Builder. We are using the Nicrron API only (user's decision). If their all-five rule inherits each sponsor's conditions, that is a disqualification risk, not a forfeited track. **Get a ruling in the first ten minutes.**
2. **Which real CRD** backs demo case 2? Ideally a consenting teammate's.
3. **Does the second backend engineer's deterministic document parser land?** If it does, it slots in behind the same extraction interface as an independent second opinion: agreement raises confidence, disagreement forces `review`. Never on the critical path.

---

*Not legal advice. Thresholds and citations follow `plan.md`; confirm with securities counsel before any real use.*
