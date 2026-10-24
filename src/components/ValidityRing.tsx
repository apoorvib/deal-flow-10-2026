import { motion } from 'motion/react'
import { THRESHOLDS } from '../lib/rules'

/** Days left out of the 90-day window, drawn as a ring. */
export function ValidityRing({ daysLeft, size = 72 }: { daysLeft: number; size?: number }) {
  const total = THRESHOLDS.passportValidityDays
  const r = 30
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(1, daysLeft / total))
  return (
    <svg viewBox="0 0 72 72" className="shrink-0 -rotate-90" width={size} height={size} aria-hidden>
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
      <motion.circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke={frac < 0.16 ? 'var(--warn)' : 'var(--accent)'}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - frac) }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
      />
    </svg>
  )
}
