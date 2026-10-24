import { usd } from '../../../lib/format'
import { INVESTOR_TYPE_LABEL, PATHWAY_LABEL } from '../../../lib/types'
import { Checkbox } from '../../../components/ui/misc'
import { useDraft, type Draft, type StepId } from '../draft'

function evidenceSummary(d: Draft): string {
  switch (d.pathway) {
    case 'income':
      return [d.income.priorYear2, d.income.priorYear1].map((v) => usd(v ?? 0)).join(' · ')
    case 'net_worth':
      return d.accountLink ? `${d.accountLink.accounts.length} linked accounts` : `${d.documents.length} statements`
    case 'license':
      return `${d.license.type.replace('series', 'Series ')} · CRD ${d.license.crd}`
    case 'min_investment':
      return usd(d.minInvestment.commitment ?? 0)
    case 'entity_assets':
      return usd(d.entityAssets.totalAssets ?? 0)
    default:
      return '—'
  }
}

export function SignStep() {
  const { draft, dispatch } = useDraft()
  const p = draft.profile
  const edit = (step: StepId) => dispatch({ type: 'goto', step })
  const signed = draft.attestations.accurate && draft.attestations.consentToVerify

  const rows: [string, string, StepId][] = [
    ['Investor', draft.investorType === 'entity' ? `${p.entityName} (${p.legalName})` : `${p.legalName} · ${INVESTOR_TYPE_LABEL[draft.investorType ?? 'individual']}`, 'profile'],
    ['ID', draft.kyc?.status === 'verified' ? 'Verified' : 'Not verified', 'identity'],
    [draft.pathway ? PATHWAY_LABEL[draft.pathway] : 'Qualify', evidenceSummary(draft), 'qualify'],
  ]

  return (
    <div className="grid gap-6">
      <dl className="divide-y divide-line rounded-[6px] border border-line">
        {rows.map(([k, v, step]) => (
          <div key={k} className="flex items-center gap-4 px-5 py-4">
            <dt className="w-28 shrink-0 text-[15px] text-ink-3">{k}</dt>
            <dd className="min-w-0 flex-1 truncate text-[16px] text-ink">{v}</dd>
            <button type="button" onClick={() => edit(step)} className="link text-[15px] font-semibold">
              Edit
            </button>
          </div>
        ))}
      </dl>

      {/* Clickwrap e-signature: the checkbox is the signature, recorded against the legal name. */}
      <Checkbox
        id="sign"
        checked={signed}
        onChange={(c) => dispatch({ type: 'patch', patch: { attestations: { ...draft.attestations, accurate: c, consentToVerify: c }, signature: c ? p.legalName : '' } })}
      >
        <span className="text-ink">I confirm this is accurate and authorize Savy to verify it.</span> Checking this box is my electronic signature.
      </Checkbox>
    </div>
  )
}
