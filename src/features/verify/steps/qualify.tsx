import { BadgeCheck, Building, HandCoins, Landmark, ShieldCheck, TrendingUp, UsersRound } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '../../../lib/cn'
import { PATHWAYS } from '../../../lib/rules'
import type { InvestorType, Pathway } from '../../../lib/types'
import { useDraft } from '../draft'
import { EvidenceStep } from './evidence'

const ICONS: Record<Pathway, typeof Landmark> = {
  net_worth: Landmark,
  income: TrendingUp,
  min_investment: HandCoins,
  license: BadgeCheck,
  entity_assets: Building,
  all_owners_accredited: UsersRound,
  registered_adviser: ShieldCheck,
}

const SHORT: Record<Pathway, (t: InvestorType) => string> = {
  net_worth: () => '$1M+ excluding your home',
  income: (t) => (t === 'joint' ? '$300K+ joint, each of the last 2 years' : '$200K+ in each of the last 2 years'),
  min_investment: (t) => (t === 'entity' ? 'Committing $1M or more' : 'Committing $200K or more'),
  license: () => 'Series 7, 65, or 82',
  entity_assets: () => 'Over $5M in assets',
  all_owners_accredited: () => 'Every owner is accredited',
  registered_adviser: () => 'Registered or exempt reporting adviser',
}

export function QualifyStep() {
  const { draft, dispatch } = useDraft()
  const t = draft.investorType ?? 'individual'
  const options = PATHWAYS.filter((p) => p.allowed(t))
  const fastest = options.some((p) => p.id === 'net_worth') ? 'net_worth' : 'min_investment'

  return (
    <div className="grid gap-8">
      <div role="radiogroup" aria-label="How you qualify" className="grid gap-2">
        {options.map((p) => {
          const on = draft.pathway === p.id
          const Icon = ICONS[p.id]
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => dispatch({ type: 'patch', patch: { pathway: p.id } })}
              className={cn(
                'flex items-center gap-4 rounded-[6px] border bg-raised px-4 py-3.5 text-left transition-[border-color,box-shadow]',
                on ? 'border-accent shadow-[0_0_0_1px_var(--accent)]' : 'border-line-strong/60 hover:border-ink-2',
              )}
            >
              <Icon className={cn('size-5 shrink-0', on ? 'text-accent' : 'text-ink-3')} strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[14px] text-ink-3">
                  {p.title}
                  {p.id === fastest && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[12px] font-semibold text-ok">Fastest</span>}
                </span>
                <span className="mt-0.5 block text-[18px] font-semibold text-ink">{SHORT[p.id](t)}</span>
              </span>
              <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border', on ? 'border-accent' : 'border-line-strong')} aria-hidden>
                {on && <span className="size-2.5 rounded-full bg-accent" />}
              </span>
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {draft.pathway && (
          <motion.div key={draft.pathway} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }} className="border-t border-line pt-8">
            <EvidenceStep />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
