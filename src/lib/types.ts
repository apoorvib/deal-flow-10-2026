// API contract: the single definition of every entity the frontend exchanges with the backend.
// Share this file with the backend team; field changes start here.

export type InvestorType = 'individual' | 'joint' | 'entity'
export type EntityKind = 'llc' | 'corporation' | 'partnership' | 'trust'

export type Pathway =
  | 'income'
  | 'net_worth'
  | 'license'
  | 'min_investment'
  | 'entity_assets'
  /** Rule 501(a)(8): every equity owner is accredited. */
  | 'all_owners_accredited'
  /** Rule 501(a)(1): SEC- or state-registered investment adviser, or exempt reporting adviser. */
  | 'registered_adviser'

export type LicenseType = 'series7' | 'series65' | 'series82'

export interface Profile {
  legalName: string
  email: string
  country: string
  entityName?: string
  entityKind?: EntityKind
}

/** Result of the identity / sanctions check (Persona in production, mocked for now). */
export interface KycSession {
  id: string
  status: 'verified' | 'failed'
  nameOnId: string
  ofacHit: boolean
  pep: boolean
  createdAt: string
}

export interface LinkedAccount {
  id: string
  institution: string
  name: string
  kind: 'checking' | 'savings' | 'brokerage' | 'retirement'
  balance: number
}

/** Account-link session (Plaid in production, mocked for now). */
export interface AccountLink {
  id: string
  accounts: LinkedAccount[]
  createdAt: string
}

export type DocType =
  | 'w2'
  | 'form_1040'
  | 'k1'
  | 'bank_statement'
  | 'brokerage_statement'
  | 'cpa_letter'
  | 'trust_agreement'
  | 'entity_formation'
  | 'other'

/** What the AI layer extracted from an uploaded document. The server keeps these; the client only references them by id. */
export interface ParsedDocument {
  id: string
  fileName: string
  docType: DocType
  holderName: string | null
  taxYear: number | null
  statementDate: string | null
  /** Income figure (AGI, or W-2 wages when no AGI) for tax documents. */
  income: number | null
  /** Total balance / account value for statements. */
  balance: number | null
  confidence: number
  flags: string[]
  summary: string
  createdAt: string
}

export interface IncomeEvidence {
  priorYear2: number
  priorYear1: number
  expectedCurrent: number
}

export interface NetWorthEvidence {
  /** Self-reported assets outside linked accounts and documents, excluding primary residence. */
  otherAssets: number
  /** Self-reported liabilities, excluding the primary-residence mortgage. */
  liabilities: number
  primaryResidenceValue: number
  primaryResidenceMortgage: number
  /** Mortgage debt added in the last 60 days (not used to buy the home). */
  mortgageIncreaseLast60Days: number
}

export interface LicenseEvidence {
  type: LicenseType
  crd: string
}

export interface MinInvestmentEvidence {
  commitment: number
}

export interface EntityAssetsEvidence {
  totalAssets: number
  formedForPurpose: boolean
}

export interface OwnersEvidence {
  ownerCount: number
  /** Signed representation that every equity owner is accredited. */
  allAccredited: boolean
}

export interface AdviserEvidence {
  /** SEC file number (801- or 802-) or CRD number. */
  fileNumber: string
}

export interface Attestations {
  accurate: boolean
  notThirdPartyFinanced: boolean
  consentToVerify: boolean
}

/** What the LP submits. Server-side facts (KYC, linked accounts, parsed docs) are referenced by id, never trusted from the client. */
export interface ApplicationInput {
  investorType: InvestorType
  profile: Profile
  kycSessionId: string | null
  pathway: Pathway
  accountLinkId: string | null
  documentIds: string[]
  income?: IncomeEvidence
  netWorth?: NetWorthEvidence
  license?: LicenseEvidence
  minInvestment?: MinInvestmentEvidence
  entityAssets?: EntityAssetsEvidence
  owners?: OwnersEvidence
  adviser?: AdviserEvidence
  attestations: Attestations
  /** Set when the LP arrived from a fund's invite. On approval the backend shares the passport with that fund. */
  inviteToken?: string
}

export type CheckResult = 'pass' | 'fail' | 'warn'

export interface Check {
  id: string
  label: string
  result: CheckResult
  detail: string
}

export type Decision = 'approved' | 'review' | 'needs_info' | 'denied'

export interface Evaluation {
  decision: Decision
  checks: Check[]
  /** Plain-language reasons shown to the LP when not approved. */
  reasons: string[]
}

export interface Verification {
  id: string
  input: ApplicationInput
  evaluation: Evaluation
  passportId: string | null
  createdAt: string
  reviewedAt: string | null
}

export interface Passport {
  id: string
  holderName: string
  investorType: InvestorType
  pathway: Pathway
  verificationId: string
  letterRef: string
  issuedAt: string
  expiresAt: string
  checks: Check[]
}

export interface Fund {
  id: string
  name: string
  manager: string
  strategy: string
  offering: '506(c)' | '506(b)'
  minCheck: number
  closing: string
}

export interface Share {
  id: string
  passportId: string
  fundId: string
  createdAt: string
  views: { at: string; by: string }[]
}

export const PATHWAY_LABEL: Record<Pathway, string> = {
  income: 'Income',
  net_worth: 'Net worth',
  license: 'Professional license',
  min_investment: 'Minimum investment',
  entity_assets: 'Entity assets',
  all_owners_accredited: 'Accredited owners',
  registered_adviser: 'Registered adviser',
}

export const INVESTOR_TYPE_LABEL: Record<InvestorType, string> = {
  individual: 'Individual',
  joint: 'Joint with spouse',
  entity: 'Entity or trust',
}

// --- Accounts & dashboards ------------------------------------------------------------------

export type Role = 'investor' | 'issuer' | 'admin'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  /** Investors: their current passport, if verified. */
  passportId: string | null
  /** Issuers: the fund they manage. */
  fundId: string | null
}

export type InvestmentStatus = 'committed' | 'funded' | 'closed'

/** An investor's commitment to a fund. Amounts are the investor's own data, shown only to them and that fund. */
export interface Investment {
  id: string
  fundId: string
  fundName: string
  manager: string
  amount: number
  status: InvestmentStatus
  committedAt: string
}

export type IncomingStatus = 'verified' | 'review' | 'needs_info' | 'expired' | 'invited'

/**
 * What a fund sees about an investor who shared a passport (or was invited).
 * Status and check outcomes only: never balances, income or net worth.
 */
export interface IncomingInvestor {
  id: string
  name: string
  email: string
  investorType: InvestorType
  status: IncomingStatus
  pathway: Pathway | null
  verifiedAt: string | null
  expiresAt: string | null
  letterRef: string | null
  /** Commitment to this fund. */
  commitment: number
  lastActivityAt: string
  /** Check labels and outcomes, with financial detail stripped. */
  checks: { id: string; label: string; result: CheckResult }[]
}

export interface IssuerOverview {
  fund: Fund
  inviteUrl: string
  investors: IncomingInvestor[]
}

// --- Admin showcase ---------------------------------------------------------------------------

/** Who an admin is currently viewing the product as. */
export type AdminView = 'admin' | 'investor' | 'issuer' | 'visitor'

export interface AdminContext {
  admin: User
  viewingAs: AdminView
  /** Demo personas the admin can switch into. */
  investor: User
  issuer: User
}

// --- Fund invites -----------------------------------------------------------------------------

export interface InviteRequest {
  email: string
  name?: string
  /** Expected commitment to the fund, shown in the fund's pipeline. */
  commitment?: number
}

export interface Invite {
  id: string
  fundId: string
  email: string
  name: string | null
  commitment: number | null
  status: 'sent' | 'opened' | 'accepted'
  sentAt: string
}

/** What the invite link shows before anything happens. Public: the token is the only credential. */
export interface InviteView {
  fund: Fund
  inviterName: string
  email: string
  name: string | null
  hasAccount: boolean
}

/**
 * Following the invite signs the LP in (creating the account if needed; the emailed link proves the address).
 * `shared`: they already held a valid passport, now shared with the fund. `confirm`: they hold one but turned off
 * auto-share, so they're asked first. `verify`: they need to verify first.
 */
export interface InviteAcceptance {
  user: User
  outcome: 'shared' | 'confirm' | 'verify'
  passportId: string | null
  fund: Fund
}

// --- Account settings -------------------------------------------------------------------------

export interface UserSettings {
  name: string
  email: string
  /** Keys depend on role; see SETTINGS_NOTIFICATIONS in pages/Settings.tsx. */
  notifications: Record<string, boolean>
  /** Investors: following a fund's invite shares a valid passport without asking. */
  autoShareOnInvite: boolean
}
