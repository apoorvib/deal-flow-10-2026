import { Check } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function Card({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' }) {
  return <As className={cn('rounded-2xl border border-line bg-raised shadow-card', className)}>{children}</As>
}

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'brass'

const tones: Record<Tone, string> = {
  neutral: 'bg-ink/[0.05] text-ink-2',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  brass: 'bg-brass-soft text-brass',
}

export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium', tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/** Large selectable card used for single-choice questions. */
export function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  meta,
  icon,
  disabled,
  name,
  value,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  description: ReactNode
  meta?: ReactNode
  icon?: ReactNode
  disabled?: boolean
  name: string
  value: string
}) {
  return (
    <label
      className={cn(
        'group relative flex cursor-pointer gap-4 rounded-xl border bg-raised p-4 transition-[border-color,box-shadow,background-color] duration-200 sm:p-5',
        selected ? 'border-accent shadow-[0_0_0_1px_var(--accent)]' : 'border-line hover:border-line-strong',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input type="radio" className="peer sr-only" name={name} value={value} checked={selected} onChange={onSelect} disabled={disabled} />
      {icon && (
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-lg border transition-colors duration-200',
            selected ? 'border-accent/20 bg-accent text-on-accent' : 'border-line bg-surface text-ink-2',
          )}
        >
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-3">
          <span className="text-[16px] font-medium text-ink">{title}</span>
          {meta}
        </span>
        <span className="text-[15px] leading-relaxed text-ink-2">{description}</span>
      </span>
      <span
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors duration-200',
          selected ? 'border-accent bg-accent text-on-accent' : 'border-line-strong bg-raised',
        )}
        aria-hidden
      >
        {selected && (
          <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 30 }}>
            <Check className="size-3" strokeWidth={3} />
          </motion.span>
        )}
      </span>
      <span className="pointer-events-none absolute inset-0 rounded-xl ring-accent/30 peer-focus-visible:ring-4" />
    </label>
  )
}

export function Checkbox({ checked, onChange, children, id }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="group flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-raised p-4 transition-colors hover:border-line-strong">
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        className={cn(
          'mt-px grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors duration-150 peer-focus-visible:ring-4 peer-focus-visible:ring-accent/20',
          checked ? 'border-accent bg-accent text-on-accent' : 'border-line-strong bg-raised',
        )}
        aria-hidden
      >
        {checked && (
          <motion.svg viewBox="0 0 12 12" className="size-3" initial={false}>
            <motion.path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, ease: 'easeOut' }} />
          </motion.svg>
        )}
      </span>
      <span className="text-[15px] leading-relaxed text-ink-2">{children}</span>
    </label>
  )
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-line', className)} />
}

/** Tiny wordmark: a rosette seal + name. */
export function Seal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <g fill="none" stroke="currentColor">
        <circle cx="16" cy="16" r="14.5" strokeWidth="1" />
        <circle cx="16" cy="16" r="11" strokeWidth="0.75" strokeDasharray="1.2 1.6" />
        <path d="M10.5 16.4l3.6 3.6 7.4-8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
