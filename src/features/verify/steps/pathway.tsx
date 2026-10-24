import { BadgeCheck, Building, HandCoins, Landmark, TrendingUp } from 'lucide-react'
import { ChoiceCard } from '../../../components/ui/misc'
import { PATHWAYS } from '../../../lib/rules'
import type { Pathway } from '../../../lib/types'
import { useDraft } from '../draft'

const ICONS: Record<Pathway, React.ReactNode> = {
  net_worth: <Landmark className="size-[18px]" strokeWidth={1.7} />,
  income: <TrendingUp className="size-[18px]" strokeWidth={1.7} />,
  min_investment: <HandCoins className="size-[18px]" strokeWidth={1.7} />,
  license: <BadgeCheck className="size-[18px]" strokeWidth={1.7} />,
  entity_assets: <Building className="size-[18px]" strokeWidth={1.7} />,
}

export function PathwayStep() {
  const { draft, dispatch } = useDraft()
  const t = draft.investorType ?? 'individual'
  const options = PATHWAYS.filter((p) => p.allowed(t))

  return (
    <div className="grid gap-3" role="radiogroup" aria-label="Qualification path">
      {options.map((p) => (
        <ChoiceCard
          key={p.id}
          name="pathway"
          value={p.id}
          selected={draft.pathway === p.id}
          onSelect={() => dispatch({ type: 'patch', patch: { pathway: p.id } })}
          title={p.title}
          icon={ICONS[p.id]}
          meta={<span className="font-mono text-[11px] text-ink-3">{p.time}</span>}
          description={
            <>
              {p.requirement(t)}
              <span className="mt-1.5 block text-[14px] text-ink-3">{p.evidence}</span>
            </>
          }
        />
      ))}
    </div>
  )
}
