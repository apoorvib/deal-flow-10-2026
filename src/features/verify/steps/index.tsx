import type { ComponentType } from 'react'
import { PATHWAY_LABEL } from '../../../lib/types'
import type { Draft, StepId } from '../draft'
import { ProfileStep, TypeStep } from './basics'
import { EvidenceStep } from './evidence'
import { IdentityStep } from './identity'
import { PathwayStep } from './pathway'
import { AttestStep, ReviewStep } from './sign'

interface StepContent {
  heading: (d: Draft) => string
  lede: (d: Draft) => string
  Body: ComponentType
}

const EVIDENCE_LEDE: Record<string, string> = {
  income: 'Enter your income, then upload a tax document for each year. We read the figures automatically and check them against what you entered.',
  net_worth: 'Linking accounts is fastest. You can also upload statements. Your primary residence doesn’t count toward net worth.',
  license: 'We confirm your registration directly with FINRA BrokerCheck.',
  min_investment: 'Enter the amount you’re committing. No documents needed.',
  entity_assets: 'Tell us about the entity’s balance sheet and share supporting documents.',
}

export const STEP_CONTENT: Record<StepId, StepContent> = {
  type: {
    heading: () => 'How are you investing?',
    lede: () => 'This sets which accreditation tests apply. You can verify other entities later.',
    Body: TypeStep,
  },
  profile: {
    heading: (d) => (d.investorType === 'entity' ? 'About you and the entity' : 'Tell us about yourself'),
    lede: () => 'Use your legal name. It needs to match your ID and your documents.',
    Body: ProfileStep,
  },
  identity: {
    heading: () => 'Confirm your identity',
    lede: () => 'A quick ID scan and selfie. We also screen against OFAC sanctions and politically exposed person lists.',
    Body: IdentityStep,
  },
  pathway: {
    heading: () => 'How do you qualify?',
    lede: () => 'Pick whichever is easiest to prove. You only need one.',
    Body: PathwayStep,
  },
  evidence: {
    heading: (d) => (d.pathway ? `Show your ${PATHWAY_LABEL[d.pathway].toLowerCase()}` : 'Evidence'),
    lede: (d) => (d.pathway ? EVIDENCE_LEDE[d.pathway] : ''),
    Body: EvidenceStep,
  },
  attest: {
    heading: () => 'Review and sign',
    lede: () => 'These statements become part of the file an attorney reviews and signs.',
    Body: AttestStep,
  },
  review: {
    heading: () => 'Ready to submit',
    lede: () => 'Clean applications are approved in minutes. Anything unusual goes to an attorney, usually the same business day.',
    Body: ReviewStep,
  },
}
