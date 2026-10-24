// Wizard draft: one reducer, persisted per-browser so an LP can leave and come back.
// Persistence mirrors the whole draft (denylist: nothing excluded today), so new fields are saved automatically.

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react'
import { PATHWAYS, minInvestmentThreshold } from '../../lib/rules'
import type {
  AccountLink,
  ApplicationInput,
  EntityKind,
  InvestorType,
  KycSession,
  LicenseType,
  ParsedDocument,
  Pathway,
  Profile,
} from '../../lib/types'

type Num = number | null

export interface Draft {
  step: StepId
  investorType: InvestorType | null
  profile: Profile
  kyc: KycSession | null
  pathway: Pathway | null
  accountLink: AccountLink | null
  documents: ParsedDocument[]
  income: { priorYear2: Num; priorYear1: Num; expectedCurrent: Num }
  netWorth: { otherAssets: Num; liabilities: Num; primaryResidenceValue: Num; primaryResidenceMortgage: Num; mortgageIncreaseLast60Days: Num }
  license: { type: LicenseType; crd: string; lookup: { found: boolean; name: string | null } | null }
  minInvestment: { commitment: Num }
  entityAssets: { totalAssets: Num; formedForPurpose: boolean }
  attestations: { accurate: boolean; notThirdPartyFinanced: boolean; consentToVerify: boolean }
  signature: string
}

export const STEPS = [
  { id: 'type', title: 'Investor type', short: 'Type' },
  { id: 'profile', title: 'Your details', short: 'Details' },
  { id: 'identity', title: 'Identity', short: 'Identity' },
  { id: 'pathway', title: 'How you qualify', short: 'Qualify' },
  { id: 'evidence', title: 'Evidence', short: 'Evidence' },
  { id: 'attest', title: 'Sign', short: 'Sign' },
  { id: 'review', title: 'Review', short: 'Review' },
] as const

export type StepId = (typeof STEPS)[number]['id']

export const initialDraft = (): Draft => ({
  step: 'type',
  investorType: null,
  profile: { legalName: '', email: '', country: 'United States' },
  kyc: null,
  pathway: null,
  accountLink: null,
  documents: [],
  income: { priorYear2: null, priorYear1: null, expectedCurrent: null },
  netWorth: { otherAssets: null, liabilities: null, primaryResidenceValue: null, primaryResidenceMortgage: null, mortgageIncreaseLast60Days: null },
  license: { type: 'series65', crd: '', lookup: null },
  minInvestment: { commitment: null },
  entityAssets: { totalAssets: null, formedForPurpose: false },
  attestations: { accurate: false, notThirdPartyFinanced: false, consentToVerify: false },
  signature: '',
})

type Action =
  | { type: 'goto'; step: StepId }
  | { type: 'patch'; patch: Partial<Draft> }
  | { type: 'profile'; patch: Partial<Profile> & { entityKind?: EntityKind } }
  | { type: 'section'; key: 'income' | 'netWorth' | 'license' | 'minInvestment' | 'entityAssets' | 'attestations'; patch: Record<string, unknown> }
  | { type: 'addDoc'; doc: ParsedDocument }
  | { type: 'removeDoc'; id: string }
  | { type: 'reset' }

function reducer(d: Draft, a: Action): Draft {
  switch (a.type) {
    case 'goto':
      return { ...d, step: a.step }
    case 'patch': {
      const next = { ...d, ...a.patch }
      // Changing investor type can invalidate the chosen pathway.
      if (a.patch.investorType && next.pathway) {
        const p = PATHWAYS.find((x) => x.id === next.pathway)
        if (p && !p.allowed(a.patch.investorType)) next.pathway = null
      }
      return next
    }
    case 'profile': {
      // A new legal name invalidates a completed ID check.
      const nameChanged = a.patch.legalName !== undefined && a.patch.legalName !== d.profile.legalName
      return { ...d, profile: { ...d.profile, ...a.patch }, kyc: nameChanged ? null : d.kyc }
    }
    case 'section':
      return { ...d, [a.key]: { ...d[a.key], ...a.patch } }
    case 'addDoc':
      return { ...d, documents: [...d.documents, a.doc] }
    case 'removeDoc':
      return { ...d, documents: d.documents.filter((x) => x.id !== a.id) }
    case 'reset':
      return initialDraft()
  }
}

const KEY = 'lp-passport.draft.v1'

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initialDraft()
    const saved = JSON.parse(raw) as Partial<Draft>
    const base = initialDraft()
    return { ...base, ...saved, profile: { ...base.profile, ...saved.profile } }
  } catch {
    return initialDraft()
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

const Ctx = createContext<{ draft: Draft; dispatch: Dispatch<Action> } | null>(null)

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, dispatch] = useReducer(reducer, undefined, loadDraft)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(draft))
    } catch {
      /* storage unavailable */
    }
  }, [draft])
  return <Ctx.Provider value={{ draft, dispatch }}>{children}</Ctx.Provider>
}

export function useDraft() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDraft must be inside DraftProvider')
  return c
}

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

/** Returns a blocking message for the step, or null when the LP can continue. */
export function stepBlocker(step: StepId, d: Draft): string | null {
  switch (step) {
    case 'type':
      return d.investorType ? null : 'Choose how you’re investing.'
    case 'profile':
      if (d.profile.legalName.trim().split(/\s+/).length < 2) return 'Enter your full legal name.'
      if (!emailOk(d.profile.email)) return 'Enter a valid email.'
      if (d.investorType === 'entity' && !d.profile.entityName?.trim()) return 'Enter the entity’s legal name.'
      if (d.investorType === 'entity' && !d.profile.entityKind) return 'Choose the entity type.'
      return null
    case 'identity':
      return d.kyc?.status === 'verified' ? null : 'Verify your ID to continue.'
    case 'pathway':
      return d.pathway ? null : 'Choose how you qualify.'
    case 'evidence': {
      const t = d.investorType ?? 'individual'
      switch (d.pathway) {
        case 'income': {
          const { priorYear1, priorYear2, expectedCurrent } = d.income
          if (priorYear1 == null || priorYear2 == null || expectedCurrent == null) return 'Enter income for each year.'
          if (!d.documents.some((x) => x.income != null)) return 'Upload at least one tax document.'
          return null
        }
        case 'net_worth':
          if (!d.accountLink && !d.documents.some((x) => x.balance != null)) return 'Link accounts or upload a statement.'
          if (d.netWorth.liabilities == null) return 'Enter your liabilities (0 if none).'
          return null
        case 'license':
          if (!/^\d{4,8}$/.test(d.license.crd)) return 'Enter your 4 to 8 digit CRD number.'
          return null
        case 'min_investment':
          return (d.minInvestment.commitment ?? 0) >= minInvestmentThreshold(t) ? null : `Commitment must be at least $${(minInvestmentThreshold(t) / 1000).toLocaleString()}K.`
        case 'entity_assets':
          return d.entityAssets.totalAssets == null ? 'Enter the entity’s total assets.' : null
        default:
          return 'Choose how you qualify first.'
      }
    }
    case 'attest': {
      const a = d.attestations
      if (!a.accurate || !a.consentToVerify) return 'Confirm both statements to sign.'
      if (d.pathway === 'min_investment' && !a.notThirdPartyFinanced) return 'Confirm the commitment isn’t financed by a third party.'
      if (d.signature.trim().length < 3) return 'Type your full name to sign.'
      return null
    }
    case 'review':
      return null
  }
}

export function toApplication(d: Draft): ApplicationInput {
  const z = (n: Num) => n ?? 0
  return {
    investorType: d.investorType!,
    profile: d.profile,
    kycSessionId: d.kyc?.id ?? null,
    pathway: d.pathway!,
    accountLinkId: d.accountLink?.id ?? null,
    documentIds: d.documents.map((x) => x.id),
    income: d.pathway === 'income' ? { priorYear2: z(d.income.priorYear2), priorYear1: z(d.income.priorYear1), expectedCurrent: z(d.income.expectedCurrent) } : undefined,
    netWorth:
      d.pathway === 'net_worth'
        ? {
            otherAssets: z(d.netWorth.otherAssets),
            liabilities: z(d.netWorth.liabilities),
            primaryResidenceValue: z(d.netWorth.primaryResidenceValue),
            primaryResidenceMortgage: z(d.netWorth.primaryResidenceMortgage),
            mortgageIncreaseLast60Days: z(d.netWorth.mortgageIncreaseLast60Days),
          }
        : undefined,
    license: d.pathway === 'license' ? { type: d.license.type, crd: d.license.crd } : undefined,
    minInvestment: d.pathway === 'min_investment' ? { commitment: z(d.minInvestment.commitment) } : undefined,
    entityAssets: d.pathway === 'entity_assets' ? { totalAssets: z(d.entityAssets.totalAssets), formedForPurpose: d.entityAssets.formedForPurpose } : undefined,
    attestations: d.attestations,
  }
}

