// Demo-only stand-in for the backend. Persists to localStorage so a passport survives reloads.
// The decision logic here is a rough imitation for driving UI states; the backend's rules engine is the real one.

import { estimateNetWorth, incomeThreshold, minInvestmentThreshold, THRESHOLDS } from '../rules'
import type {
  AccountLink,
  ApplicationInput,
  Check,
  Decision,
  Fund,
  FundingAccount,
  IncomingInvestor,
  Integration,
  IntegrationId,
  InvestorType,
  Invite,
  Investment,
  KycSession,
  ParsedDocument,
  Passport,
  Pathway,
  AdminContext,
  AdminView,
  Role,
  Share,
  User,
  UserSettings,
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
  users: Record<string, User>
  currentUserId: string | null
  /** Seeded commitments per investor user. */
  investments: Record<string, Investment[]>
  /** Fund-side pipeline overrides (nudges), keyed by investor id. */
  nudged: Record<string, string>
  /** Admin showcase: the signed-in admin behind whatever view is active. */
  adminId: string | null
  adminView: AdminView
  /** Fund invites, keyed by link token. */
  invites: Record<string, Invite>
  /** Per-user settings (never passwords). */
  settings: Record<string, Omit<UserSettings, 'name' | 'email'>>
  fundingAccounts: Record<string, FundingAccount[]>
  integrations: Record<string, Integration[]>
}

const empty = (): Db => ({ kyc: {}, links: {}, docs: {}, verifications: {}, passports: {}, shares: {}, users: {}, currentUserId: null, investments: {}, nudged: {}, adminId: null, adminView: 'admin', invites: {}, settings: {}, fundingAccounts: {}, integrations: {} })

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
  if (input.pathway === 'all_owners_accredited') {
    const o = input.owners
    if (!o || !o.allAccredited || o.ownerCount < 1) add('pathway', 'Accredited owners test', 'fail', 'Every equity owner must be accredited.', 'needs_info', 'Confirm every owner is accredited and upload ownership documents.')
    else if (!docs.length) add('pathway', 'Accredited owners test', 'fail', 'No ownership documents.', 'needs_info', 'Upload the operating agreement, LPA or cap table.')
    // Owners are confirmed against the ownership documents before the entity clears.
    else add('pathway', 'Accredited owners test', 'warn', `${o.ownerCount} owners represented as accredited; confirming against ownership documents.`, 'review', 'We’re confirming each owner against your ownership documents.')
  }
  if (input.pathway === 'registered_adviser') {
    const f = input.adviser?.fileNumber ?? ''
    if (f.startsWith('9')) add('pathway', 'Registered adviser test', 'fail', `No adviser found for ${f}.`, 'denied', 'We couldn’t find a registered or exempt reporting adviser for that number.')
    else add('pathway', 'Registered adviser test', 'pass', `Registration confirmed on the SEC’s IAPD (${f}).`)
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
  const inv = v.input.inviteToken ? db.invites[v.input.inviteToken] : undefined
  if (inv) {
    shareWith(p.id, inv.fundId)
    inv.status = 'accepted'
  }
}

function shareWith(passportId: string, fundId: string) {
  if (Object.values(db.shares).some((x) => x.passportId === passportId && x.fundId === fundId)) return
  const fund = FUNDS.find((f) => f.id === fundId)
  const at = new Date().toISOString()
  const sh: Share = { id: id('shr'), passportId, fundId, createdAt: at, views: [{ at, by: `${fund?.manager ?? 'Fund'} compliance` }] }
  db.shares[sh.id] = sh
}

const must = <T>(v: T | undefined, what: string): T => {
  if (!v) throw new ApiError(404, `${what} not found`)
  return v
}


// --- Accounts & dashboards (sandbox) --------------------------------------------------------

const ISSUER_FUND_ID = 'fund_meridian'

const titleCase = (email: string) =>
  email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ') || 'Investor'

/** Investors are linked only to the passport issued to their own email. */
function passportFor(email: string): string | null {
  const own = Object.values(db.passports)
    .filter((p) => db.verifications[p.verificationId]?.input.profile.email.toLowerCase() === email.toLowerCase())
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0]
  return own?.id ?? null
}

/** Attach the account's passport (investors and funds both hold one) and adopt the verified legal name. */
function linkPassport(user: User) {
  user.passportId = passportFor(user.email)
  const p = user.passportId ? db.passports[user.passportId] : null
  if (p && user.role === 'investor' && p.investorType !== 'entity') user.name = p.holderName
}

function seedInvestments(userId: string): Investment[] {
  const day = 86_400_000
  const ago = (d: number) => new Date(Date.now() - d * day).toISOString()
  const pick = (id: string) => FUNDS.find((f) => f.id === id)!
  const rows: [string, number, Investment['status'], number][] = [
    ['fund_meridian', 100_000, 'committed', 3],
    ['fund_halcyon', 25_000, 'funded', 21],
    ['fund_northbeam', 15_000, 'closed', 64],
  ]
  return rows.map(([fid, amount, status, d], i) => ({
    id: `inv_${userId.slice(-6)}_${i}`,
    fundId: fid,
    fundName: pick(fid).name,
    manager: pick(fid).manager,
    amount,
    status,
    committedAt: ago(d),
  }))
}

const SEED_LPS: [string, InvestorType, IncomingInvestor['status'], Pathway | null, number, number][] = [
  ['Priya Raman', 'individual', 'verified', 'net_worth', 250_000, 2],
  ['Marcus Hale', 'joint', 'verified', 'income', 100_000, 5],
  ['Okafor Family Trust', 'entity', 'review', 'entity_assets', 500_000, 0],
  ['Dana Whitfield', 'individual', 'verified', 'license', 50_000, 9],
  ['Lin Wei', 'individual', 'needs_info', 'income', 75_000, 1],
  ['Rosen Capital LLC', 'entity', 'verified', 'min_investment', 1_000_000, 12],
  ['Tomás Ibarra', 'individual', 'invited', null, 50_000, 4],
  ['Hannah Cole', 'individual', 'expired', 'net_worth', 100_000, 96],
  ['Sam Ortiz', 'joint', 'review', 'net_worth', 150_000, 0],
  ['Grace Park', 'individual', 'verified', 'min_investment', 200_000, 15],
  ['Elliot Brandt', 'individual', 'invited', null, 25_000, 2],
]

const CHECK_LABELS: Record<Pathway, string> = {
  net_worth: 'Net worth test',
  income: 'Income test',
  license: 'License test',
  min_investment: 'Minimum investment',
  entity_assets: 'Entity assets test',
  all_owners_accredited: 'Accredited owners test',
  registered_adviser: 'Registered adviser test',
}

function seededInvestor([name, investorType, status, pathway, commitment, daysAgo]: (typeof SEED_LPS)[number], i: number): IncomingInvestor {
  const day = 86_400_000
  const verifiedAt = pathway && status !== 'invited' ? new Date(Date.now() - daysAgo * day).toISOString() : null
  const expiresAt = verifiedAt ? new Date(new Date(verifiedAt).getTime() + THRESHOLDS.passportValidityDays * day).toISOString() : null
  const pending = status === 'review' || status === 'needs_info'
  const checks: IncomingInvestor['checks'] =
    status === 'invited'
      ? []
      : [
          { id: 'identity', label: 'Identity verified', result: 'pass' },
          { id: 'sanctions', label: 'Sanctions and PEP screen', result: 'pass' },
          { id: 'pathway', label: CHECK_LABELS[pathway!], result: pending ? 'warn' : 'pass' },
          ...(investorType === 'entity' ? [{ id: 'lookthrough', label: 'Entity look-through', result: status === 'review' ? ('warn' as const) : ('pass' as const) }] : []),
          { id: 'attest', label: 'Signed attestations', result: status === 'needs_info' ? 'fail' : 'pass' },
        ]
  const id = `lp_seed_${i}`
  return {
    id,
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@probe.invalid`,
    investorType,
    status,
    pathway,
    verifiedAt: status === 'verified' || status === 'expired' ? verifiedAt : null,
    expiresAt: status === 'verified' || status === 'expired' ? expiresAt : null,
    letterRef: status === 'verified' || status === 'expired' ? `AIV-2026-${(0x3a7f1 + i * 7919).toString(36).toUpperCase().slice(-6)}` : null,
    commitment,
    lastActivityAt: db.nudged[id] ?? new Date(Date.now() - Math.min(daysAgo, 3) * day - i * 3_600_000).toISOString(),
    checks,
  }
}

/** Real passports shared with the sandbox fund show up in its pipeline, stripped to status and outcomes. */
function sharedInvestors(): IncomingInvestor[] {
  return Object.values(db.shares)
    .filter((sh) => sh.fundId === ISSUER_FUND_ID)
    .map((sh): IncomingInvestor | null => {
      const p = db.passports[sh.passportId]
      if (!p) return null
      const v = db.verifications[p.verificationId]
      const active = new Date(p.expiresAt) > new Date()
      return {
        id: `lp_${sh.id}`,
        name: p.holderName,
        email: v?.input.profile.email ?? '',
        investorType: p.investorType,
        status: active ? 'verified' : 'expired',
        pathway: p.pathway,
        verifiedAt: p.issuedAt,
        expiresAt: p.expiresAt,
        letterRef: p.letterRef,
        commitment:
          commitmentTo(v?.input.profile.email ?? '', ISSUER_FUND_ID) ??
          Object.values(db.invites).find((i) => i.fundId === ISSUER_FUND_ID && i.email === v?.input.profile.email.toLowerCase())?.commitment ??
          v?.input.minInvestment?.commitment ??
          0,
        lastActivityAt: sh.createdAt,
        checks: p.checks.map((c) => ({ id: c.id, label: c.label, result: c.result })),
      }
    })
    .filter((x): x is IncomingInvestor => x !== null)
    // One row per investor: their most recent passport.
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .filter((x, i, all) => all.findIndex((y) => y.email.toLowerCase() === x.email.toLowerCase()) === i)
}

function commitmentTo(email: string, fundId: string): number | null {
  const user = Object.values(db.users).find((u) => u.role === 'investor' && u.email === email.toLowerCase())
  return (user && db.investments[user.id]?.find((i) => i.fundId === fundId)?.amount) ?? null
}

// --- Admin showcase (sandbox) ---------------------------------------------------------------

const DEMO_INVESTOR_EMAIL = 'jane@probe.invalid'
const DEMO_ISSUER_EMAIL = 'gp@meridian.probe.invalid'

function demoInput(kycId: string, over: Partial<ApplicationInput> = {}): ApplicationInput {
  return {
    investorType: 'individual',
    profile: { legalName: 'Jane Investor', email: DEMO_INVESTOR_EMAIL, country: 'United States' },
    kycSessionId: kycId,
    pathway: 'min_investment',
    accountLinkId: null,
    documentIds: [],
    minInvestment: { commitment: 250_000 },
    attestations: { accurate: true, consentToVerify: true, notThirdPartyFinanced: true },
    ...over,
  }
}

/** Runs a demo application through the same evaluation as a real submission. */
function createCase(decision: Decision): Verification {
  const kyc: KycSession = { id: id('kyc'), status: 'verified', nameOnId: 'Jane Investor', ofacHit: decision === 'review', pep: false, createdAt: new Date().toISOString() }
  db.kyc[kyc.id] = kyc
  const input =
    decision === 'needs_info'
      ? demoInput(kyc.id, { minInvestment: { commitment: 100_000 } })
      : decision === 'denied'
        ? demoInput(kyc.id, { pathway: 'license', minInvestment: undefined, license: { type: 'series65', crd: '9123456' } })
        : demoInput(kyc.id)
  const v: Verification = { id: id('ver'), input, evaluation: fakeEvaluate(input), passportId: null, createdAt: new Date().toISOString(), reviewedAt: null }
  if (v.evaluation.decision === 'approved') issue(v)
  db.verifications[v.id] = v
  return v
}

function upsertUser(email: string, role: Role, name: string): User {
  let u = Object.values(db.users).find((x) => x.email === email && x.role === role)
  if (!u) {
    u = { id: id('usr'), name, email, role, passportId: null, fundId: role === 'issuer' ? ISSUER_FUND_ID : null }
    db.users[u.id] = u
  }
  return u
}

/** Jane (verified, invested, shared with Meridian) and Meridian's GP, ready to show. */
function ensurePersonas(): { investor: User; issuer: User } {
  const investor = upsertUser(DEMO_INVESTOR_EMAIL, 'investor', 'Jane Investor')
  if (!passportFor(DEMO_INVESTOR_EMAIL) || !db.passports[passportFor(DEMO_INVESTOR_EMAIL)!]) createCase('approved')
  linkPassport(investor)
  db.investments[investor.id] ??= seedInvestments(investor.id)
  const pid = investor.passportId!
  if (!Object.values(db.shares).some((x) => x.passportId === pid && x.fundId === ISSUER_FUND_ID)) {
    const at = new Date().toISOString()
    const sh: Share = { id: id('shr'), passportId: pid, fundId: ISSUER_FUND_ID, createdAt: at, views: [{ at, by: 'Meridian Partners compliance' }] }
    db.shares[sh.id] = sh
  }
  const issuer = upsertUser(DEMO_ISSUER_EMAIL, 'issuer', 'Meridian Partners')
  return { investor, issuer }
}

function adminCtx(): AdminContext | null {
  const admin = db.adminId ? db.users[db.adminId] : null
  if (!admin) return null
  const { investor, issuer } = ensurePersonas()
  return { admin, viewingAs: db.adminView, investor, issuer }
}

const DEFAULT_NOTIFICATIONS: Record<Role, Record<string, boolean>> = {
  investor: { passportExpiry: true, fundRequests: true, productUpdates: false },
  issuer: { lpCleared: true, weeklyDigest: true, autoNudge: true },
  admin: { productUpdates: false },
}

function settingsFor(user: User): UserSettings {
  const saved = db.settings[user.id]
  return {
    name: user.name,
    email: user.email,
    notifications: { ...DEFAULT_NOTIFICATIONS[user.role], ...saved?.notifications },
    autoShareOnInvite: saved?.autoShareOnInvite ?? true,
  }
}

const INTEGRATION_IDS: IntegrationId[] = ['carta', 'angellist', 'affinity', 'junipersquare']

function integrationsFor(user: User): Integration[] {
  if (user.role !== 'issuer') throw new ApiError(403, 'Only fund accounts have platform integrations.')
  const saved = (db.integrations[user.id] ??= [])
  return INTEGRATION_IDS.map((iid) => saved.find((x) => x.id === iid) ?? { id: iid, connected: false, connectedAt: null, pushCleared: false, importContacts: false })
}

function patchIntegration(iid: IntegrationId, patch: Partial<Integration>): Integration {
  const user = currentUser()
  const next = { ...integrationsFor(user).find((x) => x.id === iid)!, ...patch }
  db.integrations[user.id] = [...integrationsFor(user).filter((x) => x.id !== iid), next]
  save()
  return next
}

const currentUser = () => must(db.currentUserId ? db.users[db.currentUserId] : undefined, 'Signed-in user')

/** Find or create the account and make it the current session. */
function signInAs(rawEmail: string, role: Role): User {
  const email = rawEmail.trim().toLowerCase()
  let user = Object.values(db.users).find((u) => u.email === email && u.role === role)
  if (!user) {
    user = {
      id: id('usr'),
      name: role === 'issuer' ? 'Meridian Partners' : role === 'admin' ? `${titleCase(email)} (admin)` : titleCase(email),
      email,
      role,
      passportId: null,
      fundId: role === 'issuer' ? ISSUER_FUND_ID : null,
    }
    db.users[user.id] = user
  }
  if (user.role !== 'admin') linkPassport(user)
  if (user.role === 'admin') {
    db.adminId = user.id
    db.adminView = 'admin'
  }
  db.currentUserId = user.id
  return user
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
  async checkAdviser(fileNumber) {
    await wait(900)
    return fileNumber.startsWith('9') ? { found: false, name: null } : { found: true, name: 'Registered investment adviser (SEC)' }
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
  async signIn(email, password, role) {
    await wait(600)
    // Demo only: any non-empty password works and none is kept. The real backend verifies a password hash.
    if (!password) throw new ApiError(400, 'Enter your password.')
    const user = signInAs(email, role)
    save()
    return user
  },
  async me() {
    await wait(150)
    const user = db.currentUserId ? db.users[db.currentUserId] : null
    if (user && user.role !== 'admin') {
      // Pick up a passport issued after sign-in.
      linkPassport(user)
      save()
    }
    return user ?? null
  },
  async signOut() {
    await wait(200)
    db.currentUserId = null
    db.adminId = null
    db.adminView = 'admin'
    save()
  },
  async getSettings() {
    await wait(200)
    return settingsFor(currentUser())
  },
  async updateSettings(patch) {
    await wait(350)
    const user = currentUser()
    if (patch.name?.trim()) user.name = patch.name.trim()
    const cur = settingsFor(user)
    db.settings[user.id] = {
      notifications: { ...cur.notifications, ...patch.notifications },
      autoShareOnInvite: patch.autoShareOnInvite ?? cur.autoShareOnInvite,
    }
    save()
    return settingsFor(user)
  },
  async changePassword(current, next) {
    await wait(500)
    currentUser()
    // Demo only: nothing is stored, so there is nothing to compare against.
    if (!current) throw new ApiError(400, 'Enter your current password.')
    if (next.length < 8) throw new ApiError(400, 'Use at least 8 characters.')
  },
  async listFundingAccounts() {
    await wait(200)
    return db.fundingAccounts[currentUser().id] ?? []
  },
  async connectFundingAccount(institution) {
    await wait(1400)
    const user = currentUser()
    const list = (db.fundingAccounts[user.id] ??= [])
    const acct: FundingAccount = {
      id: id('fa'),
      institution,
      name: 'Checking',
      last4: String(1000 + Math.floor(Math.random() * 9000)),
      isDefault: list.length === 0,
      connectedAt: new Date().toISOString(),
    }
    list.push(acct)
    save()
    return acct
  },
  async removeFundingAccount(aid) {
    await wait(300)
    const user = currentUser()
    const list = (db.fundingAccounts[user.id] ?? []).filter((a) => a.id !== aid)
    if (list.length && !list.some((a) => a.isDefault)) list[0].isDefault = true
    db.fundingAccounts[user.id] = list
    save()
  },
  async fundInvestment(investmentId, accountId) {
    await wait(1500)
    const user = currentUser()
    must((db.fundingAccounts[user.id] ?? []).find((a) => a.id === accountId), 'Funding account')
    const inv = must(db.investments[user.id]?.find((i) => i.id === investmentId), 'Investment')
    if (inv.status !== 'committed') throw new ApiError(409, 'This investment is already funded.')
    inv.status = 'funded'
    save()
    return inv
  },
  async listIntegrations() {
    await wait(200)
    return integrationsFor(currentUser())
  },
  async connectIntegration(iid) {
    await wait(1600)
    return patchIntegration(iid, { connected: true, connectedAt: new Date().toISOString(), pushCleared: true })
  },
  async disconnectIntegration(iid) {
    await wait(400)
    return patchIntegration(iid, { connected: false, connectedAt: null, pushCleared: false, importContacts: false })
  },
  async updateIntegration(iid, patch) {
    await wait(250)
    return patchIntegration(iid, patch)
  },
  async listInvestments() {
    await wait(350)
    const user = must(db.currentUserId ? db.users[db.currentUserId] : undefined, 'Signed-in user')
    if (!user.passportId) return []
    db.investments[user.id] ??= seedInvestments(user.id)
    save()
    return db.investments[user.id]
  },
  async getIssuerOverview() {
    await wait(400)
    const fund = FUNDS.find((f) => f.id === ISSUER_FUND_ID)!
    const shared = sharedInvestors()
    const invited: IncomingInvestor[] = Object.entries(db.invites)
      .filter(([, i]) => i.fundId === fund.id && !shared.some((x) => x.email.toLowerCase() === i.email))
      .map(([token, i]) => ({
        id: `lp_inv_${token}`,
        name: i.name ?? i.email,
        email: i.email,
        investorType: 'individual',
        status: 'invited',
        pathway: null,
        verifiedAt: null,
        expiresAt: null,
        letterRef: null,
        commitment: i.commitment ?? 0,
        lastActivityAt: db.nudged[`lp_inv_${token}`] ?? i.sentAt,
        checks: [],
      }))
    const investors = [...invited, ...shared, ...SEED_LPS.map(seededInvestor)].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    return { fund, inviteUrl: `${location.origin}/get-started?fund=${fund.id}`, investors }
  },
  async nudgeInvestor(investorId) {
    await wait(500)
    db.nudged[investorId] = new Date().toISOString()
    save()
  },
  async inviteInvestors(rows) {
    await wait(700)
    const user = must(db.currentUserId ? db.users[db.currentUserId] : undefined, 'Signed-in user')
    if (user.role !== 'issuer' || !user.fundId) throw new ApiError(403, 'Only fund accounts can invite investors.')
    const invites: Invite[] = []
    const devLinks: Record<string, string> = {}
    for (const r of rows) {
      const email = r.email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue
      const token = id('inv')
      const inv: Invite = { id: token, fundId: user.fundId, email, name: r.name?.trim() || null, commitment: r.commitment ?? null, status: 'sent', sentAt: new Date().toISOString() }
      db.invites[token] = inv
      invites.push(inv)
      devLinks[email] = `/invite/${token}`
    }
    save()
    return { invites, devLinks }
  },
  async getInvite(token) {
    await wait(300)
    const inv = must(db.invites[token], 'Invitation')
    if (inv.status === 'sent') inv.status = 'opened'
    save()
    const fund = must(FUNDS.find((f) => f.id === inv.fundId), 'Fund')
    return {
      fund,
      inviterName: fund.manager,
      email: inv.email,
      name: inv.name,
      hasAccount: Object.values(db.users).some((u) => u.role === 'investor' && u.email === inv.email),
    }
  },
  async acceptInvite(token) {
    await wait(700)
    const inv = must(db.invites[token], 'Invitation')
    const fund = must(FUNDS.find((f) => f.id === inv.fundId), 'Fund')
    // The emailed link proves the address, so it signs the LP in (creating the account the first time).
    const user = upsertUser(inv.email, 'investor', inv.name ?? titleCase(inv.email))
    linkPassport(user)
    db.currentUserId = user.id
    if (db.adminId) db.adminView = 'investor'
    const p = user.passportId ? db.passports[user.passportId] : undefined
    const active = !!p && new Date(p.expiresAt) > new Date()
    const auto = settingsFor(user).autoShareOnInvite
    if (active && auto) {
      shareWith(p!.id, fund.id)
      inv.status = 'accepted'
    }
    save()
    return { user, outcome: active ? (auto ? 'shared' : 'confirm') : 'verify', passportId: active ? p!.id : null, fund }
  },
  async adminContext() {
    await wait(120)
    const ctx = adminCtx()
    save()
    return ctx
  },
  async adminSwitch(as) {
    await wait(250)
    const ctx = must(adminCtx() ?? undefined, 'Admin session')
    db.adminView = as
    db.currentUserId = as === 'admin' ? ctx.admin.id : as === 'investor' ? ctx.investor.id : as === 'issuer' ? ctx.issuer.id : null
    save()
    return { ...ctx, viewingAs: as }
  },
  async adminCreateCase(decision) {
    await wait(300)
    must(adminCtx() ?? undefined, 'Admin session')
    const v = createCase(decision)
    save()
    return v
  },
  async adminReset() {
    await wait(500)
    const admin = must(db.adminId ? db.users[db.adminId] : undefined, 'Admin session')
    const fresh = empty()
    for (const k of Object.keys(db) as (keyof Db)[]) delete (db as Partial<Db>)[k]
    Object.assign(db, fresh)
    db.users[admin.id] = admin
    db.adminId = admin.id
    db.currentUserId = admin.id
    const ctx = adminCtx()!
    save()
    return ctx
  },
}

// A real API returns fresh JSON on every call. Clone results so the UI never holds a reference into the
// mock's store; otherwise an in-place update (e.g. sign-off) looks unchanged to React and won't re-render.
export const mockApi = Object.fromEntries(
  Object.entries(rawApi).map(([name, fn]) => [name, async (...args: unknown[]) => structuredClone(await (fn as (...a: unknown[]) => Promise<unknown>)(...args))]),
) as unknown as Api
