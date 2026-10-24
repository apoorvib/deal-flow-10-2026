import { Pencil } from 'lucide-react'
import { motion } from 'motion/react'
import { useId } from 'react'
import { PassportCard } from '../../../components/PassportCard'
import { Checkbox } from '../../../components/ui/misc'
import { usd } from '../../../lib/format'
import { THRESHOLDS } from '../../../lib/rules'
import { INVESTOR_TYPE_LABEL, PATHWAY_LABEL } from '../../../lib/types'
import { useDraft, type StepId } from '../draft'

export function AttestStep() {
  const { draft, dispatch } = useDraft()
  const a = draft.attestations
  const set = (patch: Partial<typeof a>) => dispatch({ type: 'section', key: 'attestations', patch })
  const sigId = useId()
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="grid gap-3">
      <Checkbox id="att-accurate" checked={a.accurate} onChange={(v) => set({ accurate: v })}>
        <span className="text-ink">Everything I&rsquo;ve provided is true and complete.</span> I&rsquo;ll tell you if anything changes before a fund accepts my investment.
      </Checkbox>
      <Checkbox id="att-consent" checked={a.consentToVerify} onChange={(v) => set({ consentToVerify: v })}>
        <span className="text-ink">I authorize verification.</span> You may confirm my information with the sources I linked or uploaded, and a licensed attorney may review my file and sign a verification letter.
      </Checkbox>
      <Checkbox id="att-financed" checked={a.notThirdPartyFinanced} onChange={(v) => set({ notThirdPartyFinanced: v })}>
        <span className="text-ink">My investment won&rsquo;t be financed by a third party</span> for the purpose of meeting any minimum.
        {draft.pathway !== 'min_investment' && <span className="text-ink-3"> Optional for your path.</span>}
      </Checkbox>

      <div className="mt-6 rounded-2xl border border-line bg-raised p-5 sm:p-6">
        <div className="flex items-baseline justify-between">
          <label htmlFor={sigId} className="text-[13px] font-medium text-ink">
            Signature
          </label>
          <span className="font-mono text-[11px] text-ink-3">{today}</span>
        </div>
        <div className="relative mt-3">
          <input
            id={sigId}
            value={draft.signature}
            onChange={(e) => dispatch({ type: 'patch', patch: { signature: e.target.value } })}
            placeholder="Type your full legal name"
            autoComplete="off"
            className="display h-16 w-full border-0 border-b border-line-strong bg-transparent px-1 text-[30px] text-ink italic placeholder:text-[16px] placeholder:not-italic placeholder:font-sans placeholder:text-ink-3/70 focus:border-accent focus:outline-none"
          />
          <motion.span className="absolute right-0 bottom-0 left-0 h-px origin-left bg-accent" initial={false} animate={{ scaleX: draft.signature ? 1 : 0 }} />
        </div>
        <p className="mt-3 text-[12.5px] text-ink-3">Typing your name here is a legally binding electronic signature under the E-SIGN Act.</p>
      </div>
    </div>
  )
}

export function ReviewStep() {
  const { draft, dispatch } = useDraft()
  const edit = (step: StepId) => dispatch({ type: 'goto', step })
  const p = draft.profile
  const now = new Date()

  const evidence: [string, string][] = (() => {
    switch (draft.pathway) {
      case 'income':
        return [
          ['Income', [draft.income.priorYear2, draft.income.priorYear1].map((v) => usd(v ?? 0)).join(' · ')],
          ['Expected this year', usd(draft.income.expectedCurrent ?? 0)],
        ]
      case 'net_worth':
        return [
          ['Linked accounts', draft.accountLink ? `${draft.accountLink.accounts.length} accounts` : 'None'],
          ['Liabilities', usd(draft.netWorth.liabilities ?? 0)],
        ]
      case 'license':
        return [['License', `${draft.license.type.replace('series', 'Series ')} · CRD ${draft.license.crd}`]]
      case 'min_investment':
        return [['Commitment', usd(draft.minInvestment.commitment ?? 0)]]
      case 'entity_assets':
        return [['Entity assets', usd(draft.entityAssets.totalAssets ?? 0)]]
      default:
        return []
    }
  })()

  return (
    <div className="grid gap-8">
      <div className="mx-auto w-full max-w-md">
        <PassportCard
          interactive={false}
          data={{
            holderName: draft.investorType === 'entity' ? p.entityName ?? p.legalName : p.legalName,
            investorType: draft.investorType ?? 'individual',
            pathway: draft.pathway ?? 'net_worth',
            letterRef: 'AIV-PENDING',
            issuedAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + THRESHOLDS.passportValidityDays * 86_400_000).toISOString(),
            status: 'specimen',
          }}
        />
        <p className="mt-3 text-center text-[12.5px] text-ink-3">Preview. Your passport is issued once verification completes.</p>
      </div>

      <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-raised">
        <ReviewRow label="Investing as" value={draft.investorType ? INVESTOR_TYPE_LABEL[draft.investorType] : '—'} onEdit={() => edit('type')} />
        <ReviewRow label="Legal name" value={p.legalName} sub={draft.investorType === 'entity' ? `${p.entityName} (${p.entityKind})` : p.email} onEdit={() => edit('profile')} />
        <ReviewRow label="Identity" value={draft.kyc?.status === 'verified' ? 'Verified' : 'Not verified'} sub={draft.kyc?.ofacHit ? 'Sanctions screen flagged for review' : 'Sanctions and PEP: clear'} onEdit={() => edit('identity')} />
        <ReviewRow label="Qualifying by" value={draft.pathway ? PATHWAY_LABEL[draft.pathway] : '—'} onEdit={() => edit('pathway')} />
        {evidence.map(([k, v]) => (
          <ReviewRow key={k} label={k} value={v} mono onEdit={() => edit('evidence')} />
        ))}
        {draft.documents.length > 0 && <ReviewRow label="Documents" value={`${draft.documents.length} uploaded`} sub={draft.documents.map((d) => d.fileName).join(', ')} onEdit={() => edit('evidence')} />}
        <ReviewRow label="Signed" value={draft.signature} serif onEdit={() => edit('attest')} />
      </dl>
    </div>
  )
}

function ReviewRow({ label, value, sub, onEdit, mono, serif }: { label: string; value: string; sub?: string; onEdit: () => void; mono?: boolean; serif?: boolean }) {
  return (
    <div className="group grid grid-cols-[minmax(0,140px)_1fr_auto] items-start gap-4 px-5 py-4">
      <dt className="pt-0.5 text-[13px] text-ink-3">{label}</dt>
      <dd className="min-w-0">
        <p className={serif ? 'display text-[19px] text-ink italic' : mono ? 'tnum font-mono text-[13.5px] text-ink' : 'text-[14px] text-ink'}>{value}</p>
        {sub && <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{sub}</p>}
      </dd>
      <button type="button" onClick={onEdit} className="rounded-md p-1.5 text-ink-3 opacity-60 transition hover:bg-ink/5 hover:text-ink group-hover:opacity-100" aria-label={`Edit ${label}`}>
        <Pencil className="size-3.5" />
      </button>
    </div>
  )
}
