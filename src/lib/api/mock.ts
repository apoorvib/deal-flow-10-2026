// Demo-only stand-in for the backend. Persists to localStorage so a passport survives reloads.
// The decision logic here is a rough imitation for driving UI states; the backend's rules engine is the real one.

import { estimateNetWorth, incomeThreshold, minInvestmentThreshold, THRESHOLDS } from '../rules'
import type {
  AccountLink,
  ApplicationInput,
  Check,
  Decision,
  Fund,
  KycSession,
  ParsedDocument,
  Passport,
  Share,
  Verification,
} from '../types'
import type { AccountScenario, Api, KycScenario } from './client'
import { ApiError } from './errors'

const KEY = 'lp-passport.mock.v1'

interface Db {
  kyc: Record<string, KycSession>
  links: Record<string, AccountLink>
  docs: Record<string, ParsedDocument>
  verifications: Record<string, Verification>
  passports: Record<string, Passport>
  shares: Record<string, Share>
}

const empty = (): Db => ({ kyc: {}, links: {}, docs: {}, verifications: {}, passports: {}, shares: {} })

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...empty(), ...(JSON.parse(raw) as Db) } : empty()
  } catch {
    return empty()
  }
}

const db = load()
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* storage unavailable; keep in memory */
  }
}

const id = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.3))
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export const FUNDS: Fund[] = [
  { id: 'fund_meridian', name: 'Meridian Seed Fund II', manager: 'Meridian Partners', strategy: 'Pre-seed and seed, B2B software', offering: '506(c)', minCheck: 25_000, closing: '2026-12-15' },
  { id: 'fund_halcyon', name: 'Halcyon Grid Storage SPV', manager: 'Halcyon Collective', strategy: 'Single-asset SPV, utility-scale storage', offering: '506(c)', minCheck: 10_000, closing: '2026-11-08' },
  { id: 'fund_northbeam', name: 'Northbeam Rolling Fund', manager: 'Northbeam Capital', strategy: 'Quarterly rolling fund, fintech infrastructure', offering: '506(c)', minCheck: 5_000, closing: 'Rolling' },
  { id: 'fund_quarry', name: 'Quarry Street Residential III', manager: 'Quarry Street Capital', strategy: 'Multifamily value-add, Sun Belt', offering: '506(c)', minCheck: 50_000, closing: '2027-01-31' },
  { id: 'fund_lattice', name: 'Lattice Bio Opportunities', manager: 'Lattice Ventures', strategy: 'Seed-stage therapeutics', offering: '506(b)', minCheck: 100_000, closing: '2027-02-28' },
]

function fakeParse(file: File, holder: string): Omit<ParsedDocument, 'id' | 'createdAt'> {
  const n = file.name.toLowerCase()
  const yearMatch = n.match(/20\d\d/)
  const lastYear = new Date().getFullYear() - 1
  const year = yearMatch ? Number(yearMatch[0]) : lastYear
  const base = { fileName: file.name, holderName: holder || null, confidence: 0.94, flags: [] as string[] }
  if (n.includes('edited') || n.includes('copy')) base.flags.push('Font inconsistencies in totals section')
  if (/w-?2|1040|k-?1|tax/.test(n)) {
    const docType = n.includes('1040') ? 'form_1040' : /k-?1/.test(n) ? 'k1' : 'w2'
    const income = 236_000 + ((year * 7919) % 90) * 1000
    return { ...base, docType, taxYear: year, statementDate: null, income, balance: null, summary: `${docType === 'form_1040' ? 'Form 1040' : docType === 'k1' ? 'Schedule K-1' : 'Form W-2'} for tax year ${year}, ${usd(income)} reported.` }
  }
  if (/statement|brokerage|bank|account/.test(n)) {
    const d = new Date(Date.now() - 18 * 86_400_000).toISOString().slice(0, 10)
    const balance = n.includes('bank') ? 142_380 : 1_268_450
    return { ...base, docType: n.includes('bank') ? 'bank_statement' : 'brokerage_statement', taxYear: null, statementDate: d, income: null, balance, summary: `Statement dated ${d}, ending value ${usd(balance)}.` }
  }
  if (/cpa|letter/.test(n)) {
    return { ...base, docType: 'cpa_letter', taxYear: null, statementDate: null, income: null, balance: null, summary: 'CPA letter confirming accredited status.' }
  }
  return { ...base, docType: 'other', taxYear: null, statementDate: null, income: null, balance: null, confidence: 0.58, summary: 'Document type unclear.' }
}

function fakeEvaluate(input: ApplicationInput): { decision: Decision; checks: Check[]; reasons: string[] } {
  const checks: Check[] = []
  const reasons: string[] = []
  const rank: Record<Decision, number> = { approved: 0, review: 1, needs_info: 2, denied: 3 }
  let decision: Decision = 'approved'
  const add = (cid: string, label: string, result: Check['result'], detail: string, esc?: Decision, reason?: string) => {
    checks.push({ id: cid, label, result, detail })
    if (esc && rank[esc] > rank[decision]) decision = esc
    if (reason) reasons.push(reason)
  }

  const kyc = input.kycSessionId ? db.kyc[input.kycSessionId] : null
  if (!kyc || kyc.status !== 'verified') add('identity', 'Identity verified', 'fail', 'ID check incomplete.', 'needs_info', 'Complete the ID check.')
  else {
    add('identity', 'Identity verified', 'pass', `Government ID matched to ${kyc.nameOnId}.`)
    if (kyc.ofacHit) add('sanctions', 'Sanctions and PEP screen', 'warn', 'Possible OFAC list match.', 'review', 'We\u2019re confirming your sanctions screen.')
    else add('sanctions', 'Sanctions and PEP screen', 'pass', 'No OFAC or PEP matches.')
  }

  const docs = input.documentIds.map((d) => db.docs[d]).filter(Boolean)
  for (const d of docs) {
    if (d.confidence < THRESHOLDS.reviewConfidence || d.flags.length) add(`doc_${d.id}`, d.fileName, 'warn', d.flags[0] ?? 'Low extraction confidence.', 'review', `We\u2019re double-checking ${d.fileName}.`)
    else add(`doc_${d.id}`, d.fileName, 'pass', d.summary)
  }

  const t = input.investorType
  switch (input.pathway) {
    case 'income': {
      const th = incomeThreshold(t)
      const inc = input.income
      if (!inc || inc.priorYear1 < th || inc.priorYear2 < th || inc.expectedCurrent < th) add('pathway', 'Income test', 'fail', `Below ${usd(th)} in at least one year.`, 'denied', `Reported income is below ${usd(th)}.`)
      else {
        add('pathway', 'Income test', 'pass', `Above ${usd(th)} in both prior years and expected this year.`)
        const years = new Set(docs.filter((d) => d.taxYear).map((d) => d.taxYear))
        const y = new Date().getFullYear()
        for (const yr of [y - 2, y - 1]) {
          if (years.has(yr)) add(`income_${yr}`, `${yr} income documented`, 'pass', 'Tax document matches reported figure.')
          else add(`income_${yr}`, `${yr} income documented`, 'fail', `No tax document for ${yr}.`, 'needs_info', `Upload a W-2, 1040, or K-1 for ${yr}.`)
        }
      }
      break
    }
    case 'net_worth': {
      const nw = input.netWorth
      const linked = input.accountLinkId ? db.links[input.accountLinkId]?.accounts.reduce((s, a) => s + a.balance, 0) ?? 0 : 0
      const stmt = docs.reduce((s, d) => s + (d.balance ?? 0), 0)
      const r = estimateNetWorth({ verifiedAssets: linked + stmt, otherAssets: nw?.otherAssets ?? 0, liabilities: nw?.liabilities ?? 0, primaryResidenceValue: nw?.primaryResidenceValue ?? 0, primaryResidenceMortgage: nw?.primaryResidenceMortgage ?? 0, mortgageIncreaseLast60Days: nw?.mortgageIncreaseLast60Days ?? 0 })
      if (r.netWorth < THRESHOLDS.netWorth) add('pathway', 'Net worth test', 'fail', `${usd(r.netWorth)} is below $1,000,000.`, 'denied', 'Net worth is below $1M, excluding your home.')
      else {
        add('pathway', 'Net worth test', 'pass', `${usd(r.assets)} assets − ${usd(r.liabilities)} liabilities = ${usd(r.netWorth)}.`)
        if (linked + stmt - r.liabilities >= THRESHOLDS.netWorth) add('assets_verified', 'Assets independently confirmed', 'pass', `${usd(linked + stmt)} confirmed via linked accounts and statements.`)
        else add('assets_verified', 'Assets independently confirmed', 'warn', `Only ${usd(linked + stmt)} confirmed; the rest is self-reported.`, 'review', 'We\u2019re confirming the self-reported part of your net worth.')
        add('liabilities', 'Liabilities', 'warn', 'Self-reported until credit data is connected.')
      }
      break
    }
    case 'license':
      if (input.license?.crd.startsWith('9')) add('pathway', 'License test', 'fail', `No active license for CRD ${input.license.crd}.`, 'denied', 'We couldn’t find an active license for that CRD.')
      else add('pathway', 'License test', 'pass', `Active ${input.license?.type.replace('series', 'Series ')} on FINRA BrokerCheck.`)
      break
    case 'min_investment': {
      const th = minInvestmentThreshold(t)
      if ((input.minInvestment?.commitment ?? 0) < th) add('pathway', 'Minimum investment', 'fail', `Below ${usd(th)}.`, 'needs_info', `This path needs a commitment of at least ${usd(th)}.`)
      else add('pathway', 'Minimum investment', 'pass', `${usd(input.minInvestment!.commitment)} commitment, not third-party financed.`)
      break
    }
    case 'entity_assets':
      if ((input.entityAssets?.totalAssets ?? 0) <= THRESHOLDS.entityAssets) add('pathway', 'Entity assets test', 'fail', 'Assets at or below $5M.', 'denied', 'Entity assets are $5M or less.')
      else if (input.entityAssets?.formedForPurpose) add('pathway', 'Entity assets test', 'warn', 'Formed for this investment; owners need look-through.', 'review', 'Entities formed for this investment need an owner look-through.')
      else add('pathway', 'Entity assets test', 'pass', `${usd(input.entityAssets!.totalAssets)} in total assets.`)
      break
  }
  if (t === 'entity' && input.profile.entityKind === 'trust') add('trust', 'Trust look-through', 'warn', 'Grantor and trustees are being confirmed.', 'review', 'We\u2019re confirming the trust\u2019s grantor and trustees.')
  add('attest', 'Signed attestations', input.attestations.accurate && input.attestations.consentToVerify ? 'pass' : 'fail', 'Accuracy statement and consent to verify.')
  return { decision, checks, reasons: [...new Set(reasons)] }
}

function issue(v: Verification) {
  const now = new Date()
  const p: Passport = {
    id: id('pp'),
    holderName: v.input.investorType === 'entity' ? v.input.profile.entityName || v.input.profile.legalName : v.input.profile.legalName,
    investorType: v.input.investorType,
    pathway: v.input.pathway,
    verificationId: v.id,
    letterRef: `AIV-${now.getFullYear()}-${v.id.slice(-6).toUpperCase()}`,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + THRESHOLDS.passportValidityDays * 86_400_000).toISOString(),
    checks: v.evaluation.checks,
  }
  db.passports[p.id] = p
  v.passportId = p.id
}

const must = <T>(v: T | undefined, what: string): T => {
  if (!v) throw new ApiError(404, `${what} not found`)
  return v
}

const rawApi: Api = {
  async startKyc(legalName: string, scenario: KycScenario = 'clean') {
    await wait(2400)
    const s: KycSession = { id: id('kyc'), status: scenario === 'fail' ? 'failed' : 'verified', nameOnId: legalName, ofacHit: scenario === 'ofac', pep: false, createdAt: new Date().toISOString() }
    db.kyc[s.id] = s
    save()
    return s
  },
  async linkAccounts(scenario: AccountScenario = 'high') {
    await wait(1600)
    const k = scenario === 'high' ? 1 : 0.2
    const link: AccountLink = {
      id: id('link'),
      createdAt: new Date().toISOString(),
      accounts: [
        { id: 'a1', institution: 'Chase', name: 'Total Checking •• 4417', kind: 'checking', balance: Math.round(84_250 * k) },
        { id: 'a2', institution: 'Fidelity', name: 'Individual Brokerage •• 2093', kind: 'brokerage', balance: Math.round(1_142_900 * k) },
        { id: 'a3', institution: 'Vanguard', name: 'Rollover IRA •• 7781', kind: 'retirement', balance: Math.round(318_400 * k) },
      ],
    }
    db.links[link.id] = link
    save()
    return link
  },
  async uploadDocument(file, holderHint) {
    await wait(2600)
    const d: ParsedDocument = { id: id('doc'), createdAt: new Date().toISOString(), ...fakeParse(file, holderHint) }
    db.docs[d.id] = d
    save()
    return d
  },
  async checkLicense(_type, crd) {
    await wait(900)
    return crd.startsWith('9') ? { found: false, name: null } : { found: true, name: 'Registered representative' }
  },
  async submitVerification(input) {
    await wait(2200)
    const evaluation = fakeEvaluate(input)
    const v: Verification = { id: id('ver'), input, evaluation, passportId: null, createdAt: new Date().toISOString(), reviewedAt: null }
    if (evaluation.decision === 'approved') issue(v)
    db.verifications[v.id] = v
    save()
    return v
  },
  async getVerification(vid) {
    await wait(250)
    return must(db.verifications[vid], 'Verification')
  },
  async signOff(vid) {
    await wait(1200)
    const v = must(db.verifications[vid], 'Verification')
    if (v.evaluation.decision !== 'review') throw new ApiError(409, 'Only cases in review can be signed off.')
    v.evaluation = { ...v.evaluation, decision: 'approved', reasons: [] }
    v.reviewedAt = new Date().toISOString()
    issue(v)
    save()
    return v
  },
  async getPassport(pid) {
    await wait(250)
    const p = must(db.passports[pid], 'Passport')
    return { passport: p, active: new Date(p.expiresAt) > new Date() }
  },
  async findPassport(email, letterRef) {
    await wait(700)
    const ref = letterRef.trim().toUpperCase()
    const p = Object.values(db.passports).find(
      (x) => x.letterRef === ref && db.verifications[x.verificationId]?.input.profile.email.toLowerCase() === email.trim().toLowerCase(),
    )
    return p ? { passportId: p.id } : null
  },
  async listFunds() {
    await wait(300)
    return FUNDS
  },
  async listShares(pid) {
    await wait(200)
    return Object.values(db.shares).filter((s) => s.passportId === pid)
  },
  async sharePassport(pid, fundId) {
    await wait(900)
    must(db.passports[pid], 'Passport')
    const fund = must(FUNDS.find((f) => f.id === fundId), 'Fund')
    const existing = Object.values(db.shares).find((s) => s.passportId === pid && s.fundId === fundId)
    if (existing) return existing
    const at = new Date().toISOString()
    const s: Share = { id: id('shr'), passportId: pid, fundId, createdAt: at, views: [{ at, by: `${fund.manager} compliance` }] }
    db.shares[s.id] = s
    save()
    return s
  },
  async revokeShare(pid, sid) {
    await wait(500)
    const s = must(db.shares[sid], 'Share')
    if (s.passportId !== pid) throw new ApiError(404, 'Share not found')
    delete db.shares[sid]
    save()
  },
}

// A real API returns fresh JSON on every call. Clone results so the UI never holds a reference into the
// mock's store; otherwise an in-place update (e.g. sign-off) looks unchanged to React and won't re-render.
export const mockApi = Object.fromEntries(
  Object.entries(rawApi).map(([name, fn]) => [name, async (...args: unknown[]) => structuredClone(await (fn as (...a: unknown[]) => Promise<unknown>)(...args))]),
) as unknown as Api
