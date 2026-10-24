// Client-side copy of the Rule 501(a) thresholds. These exist only to explain requirements early
// and show live hints; the backend makes the actual decision.

import type { InvestorType, Pathway } from './types'

export const THRESHOLDS = {
  incomeIndividual: 200_000,
  incomeJoint: 300_000,
  netWorth: 1_000_000,
  minInvestmentIndividual: 200_000,
  minInvestmentEntity: 1_000_000,
  entityAssets: 5_000_000,
  freshnessDays: 90,
  passportValidityDays: 90,
} as const

export interface PathwayInfo {
  id: Pathway
  title: string
  requirement: (t: InvestorType) => string
  evidence: string
  time: string
  allowed: (t: InvestorType) => boolean
}

export const PATHWAYS: PathwayInfo[] = [
  {
    id: 'net_worth',
    title: 'Net worth',
    requirement: () => 'Over $1M in net worth, not counting your primary residence.',
    evidence: 'Link accounts or upload recent statements',
    time: '~3 min',
    allowed: (t) => t !== 'entity',
  },
  {
    id: 'income',
    title: 'Income',
    requirement: (t) =>
      t === 'joint'
        ? '$300K+ joint income in each of the last two years, expected again this year.'
        : '$200K+ income in each of the last two years, expected again this year.',
    evidence: 'Upload W-2s, 1040s, or K-1s for both years',
    time: '~4 min',
    allowed: (t) => t !== 'entity',
  },
  {
    id: 'min_investment',
    title: 'Minimum investment',
    requirement: (t) =>
      t === 'entity'
        ? 'Commit $1M or more, not financed by a third party.'
        : 'Commit $200K or more, not financed by a third party.',
    evidence: 'A signed statement, nothing to upload',
    time: '~1 min',
    allowed: () => true,
  },
  {
    id: 'license',
    title: 'Professional license',
    requirement: () => 'Hold an active Series 7, 65, or 82 license in good standing.',
    evidence: 'Your FINRA CRD number',
    time: '~1 min',
    allowed: (t) => t !== 'entity',
  },
  {
    id: 'entity_assets',
    title: 'Entity assets',
    requirement: () => 'The entity holds over $5M in assets and wasn’t formed for this investment.',
    evidence: 'Financial statements or a CPA letter',
    time: '~4 min',
    allowed: (t) => t === 'entity',
  },
]

/** Net worth per Rule 501(a)(5): home excluded; its mortgage counts only if underwater or recently increased. */
export function estimateNetWorth(v: {
  verifiedAssets: number
  otherAssets: number
  liabilities: number
  primaryResidenceValue: number
  primaryResidenceMortgage: number
  mortgageIncreaseLast60Days: number
}) {
  const underwater = Math.max(0, v.primaryResidenceMortgage - v.primaryResidenceValue)
  const recent = Math.min(v.mortgageIncreaseLast60Days, v.primaryResidenceMortgage)
  const assets = v.verifiedAssets + v.otherAssets
  const liabilities = v.liabilities + Math.max(underwater, recent)
  return { assets, liabilities, netWorth: assets - liabilities }
}

export const incomeThreshold = (t: InvestorType) => (t === 'joint' ? THRESHOLDS.incomeJoint : THRESHOLDS.incomeIndividual)
export const minInvestmentThreshold = (t: InvestorType) =>
  t === 'entity' ? THRESHOLDS.minInvestmentEntity : THRESHOLDS.minInvestmentIndividual
