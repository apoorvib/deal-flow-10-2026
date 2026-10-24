import { Building2, User, Users } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Field, Input, Select } from '../../../components/ui/field'
import { ChoiceCard } from '../../../components/ui/misc'
import type { EntityKind, InvestorType, Profile } from '../../../lib/types'
import { useDraft } from '../draft'

const TYPES: { id: InvestorType; title: string; body: string; icon: React.ReactNode }[] = [
  { id: 'individual', title: 'As an individual', body: 'Investing in your own name, including through an IRA you control.', icon: <User className="size-[18px]" strokeWidth={1.7} /> },
  { id: 'joint', title: 'Jointly with a spouse', body: 'Combining income or assets with a spouse or spousal equivalent.', icon: <Users className="size-[18px]" strokeWidth={1.7} /> },
  { id: 'entity', title: 'Through an entity or trust', body: 'An LLC, corporation, partnership, or trust is the investor of record.', icon: <Building2 className="size-[18px]" strokeWidth={1.7} /> },
]

export function TypeStep() {
  const { draft, dispatch } = useDraft()
  return (
    <div className="grid gap-3" role="radiogroup" aria-label="Investor type">
      {TYPES.map((t) => (
        <ChoiceCard
          key={t.id}
          name="investorType"
          value={t.id}
          selected={draft.investorType === t.id}
          onSelect={() => dispatch({ type: 'patch', patch: { investorType: t.id } })}
          title={t.title}
          description={t.body}
          icon={t.icon}
        />
      ))}
    </div>
  )
}

const ENTITY_KINDS: { id: EntityKind; label: string }[] = [
  { id: 'llc', label: 'LLC' },
  { id: 'corporation', label: 'Corporation' },
  { id: 'partnership', label: 'Partnership' },
  { id: 'trust', label: 'Trust' },
]

const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Singapore', 'Germany', 'Australia', 'Other']

export function ProfileStep() {
  const { draft, dispatch } = useDraft()
  const p = draft.profile
  const set = (patch: Partial<Profile>) => dispatch({ type: 'profile', patch })

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Full legal name" htmlFor="legalName" hint="Exactly as it appears on your ID." className="sm:col-span-2">
          <Input id="legalName" autoComplete="name" value={p.legalName} onChange={(e) => set({ legalName: e.target.value })} placeholder="Eleanor M. Whitaker" />
        </Field>
        <Field label="Email" htmlFor="email" hint="Where we send your letter and expiry reminders.">
          <Input id="email" type="email" autoComplete="email" value={p.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@example.com" />
        </Field>
        <Field label="Country of residence" htmlFor="country">
          <Select id="country" value={p.country} onChange={(e) => set({ country: e.target.value })}>
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>

      <AnimatePresence initial={false}>
        {draft.investorType === 'entity' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="grid gap-6 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2">
              <p className="eyebrow sm:col-span-2">Entity</p>
              <Field label="Entity legal name" htmlFor="entityName" className="sm:col-span-2">
                <Input id="entityName" value={p.entityName ?? ''} onChange={(e) => set({ entityName: e.target.value })} placeholder="Whitaker Family Holdings LLC" />
              </Field>
              <Field label="Entity type" htmlFor="entityKind" className="sm:col-span-2" hint={p.entityKind === 'trust' ? 'Trusts always get a short attorney review of the grantor and trustees.' : undefined}>
                <div id="entityKind" className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
                  {ENTITY_KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      role="radio"
                      aria-checked={p.entityKind === k.id}
                      onClick={() => set({ entityKind: k.id })}
                      className={
                        p.entityKind === k.id
                          ? 'h-10 rounded-lg border border-accent bg-accent text-sm font-medium text-on-accent transition-colors'
                          : 'h-10 rounded-lg border border-line-strong bg-raised text-sm text-ink-2 transition-colors hover:border-ink-3 hover:text-ink'
                      }
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
