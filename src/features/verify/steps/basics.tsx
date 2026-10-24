import { Building2, User, Users } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Field, Input } from '../../../components/ui/field'
import { cn } from '../../../lib/cn'
import type { EntityKind, InvestorType, Profile } from '../../../lib/types'
import { useDraft } from '../draft'

const TYPES: { id: InvestorType; label: string; icon: typeof User }[] = [
  { id: 'individual', label: 'Just me', icon: User },
  { id: 'joint', label: 'With spouse', icon: Users },
  { id: 'entity', label: 'Entity or trust', icon: Building2 },
]

const ENTITY_KINDS: { id: EntityKind; label: string }[] = [
  { id: 'llc', label: 'LLC' },
  { id: 'corporation', label: 'Corp' },
  { id: 'partnership', label: 'Partnership' },
  { id: 'trust', label: 'Trust' },
]

function Segmented<T extends string>({ value, options, onChange, label }: { value: T | null | undefined; options: { id: T; label: string; icon?: typeof User }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-2">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cn(
              'flex h-12 items-center justify-center gap-2 rounded-[4px] border px-2 text-[16px] transition-[border-color,box-shadow,color]',
              on ? 'border-accent text-ink shadow-[0_0_0_1px_var(--accent)]' : 'border-line-strong text-ink-2 hover:border-ink-2',
            )}
          >
            {o.icon && <o.icon className={cn('size-4 shrink-0', on ? 'text-accent' : 'text-ink-3')} strokeWidth={1.75} />}
            <span className="truncate">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ProfileStep() {
  const { draft, dispatch } = useDraft()
  const p = draft.profile
  const set = (patch: Partial<Profile>) => dispatch({ type: 'profile', patch })
  const entity = draft.investorType === 'entity'

  return (
    <div className="grid gap-6">
      <Field label="Who's investing?">
        <Segmented label="Who's investing" value={draft.investorType} options={TYPES} onChange={(v) => dispatch({ type: 'patch', patch: { investorType: v } })} />
      </Field>
      <Field label="Full legal name" hint="As shown on your ID">
        <Input autoComplete="name" value={p.legalName} onChange={(e) => set({ legalName: e.target.value })} />
      </Field>
      <Field label="Email">
        <Input type="email" autoComplete="email" inputMode="email" value={p.email} onChange={(e) => set({ email: e.target.value })} />
      </Field>
      <AnimatePresence initial={false}>
        {entity && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="grid gap-6 overflow-hidden">
            <Field label="Entity name">
              <Input autoComplete="organization" value={p.entityName ?? ''} onChange={(e) => set({ entityName: e.target.value })} />
            </Field>
            <Field label="Entity type">
              <Segmented label="Entity type" value={p.entityKind} options={ENTITY_KINDS} onChange={(v) => set({ entityKind: v })} />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
