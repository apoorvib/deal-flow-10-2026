import type { ComponentType } from 'react'
import type { Draft, StepId } from '../draft'
import { ProfileStep } from './basics'
import { IdentityStep } from './identity'
import { QualifyStep } from './qualify'
import { SignStep } from './sign'

interface StepContent {
  heading: (d: Draft) => string
  /** `onDone` lets a step advance itself when there's nothing left for the LP to do. */
  Body: ComponentType<{ onDone: () => void }>
}

export const STEP_CONTENT: Record<StepId, StepContent> = {
  profile: { heading: () => 'Let’s get started', Body: ProfileStep },
  identity: { heading: () => 'Verify your ID', Body: IdentityStep },
  qualify: { heading: () => 'How do you qualify?', Body: QualifyStep },
  sign: { heading: () => 'Review and submit', Body: SignStep },
}
