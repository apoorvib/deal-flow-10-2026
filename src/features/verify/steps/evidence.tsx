import NumberFlow from '@number-flow/react'
import { Check, CircleCheck, CircleX, Link2, Loader2, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog } from 'radix-ui'
import { useId, useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Field, Input, MoneyInput } from '../../../components/ui/field'
import { Checkbox } from '../../../components/ui/misc'
import { api, isMock, type AccountScenario } from '../../../lib/api/client'
import { cn } from '../../../lib/cn'
import { usd } from '../../../lib/format'
import { estimateNetWorth, incomeThreshold, minInvestmentThreshold, THRESHOLDS } from '../../../lib/rules'
import type { LicenseType } from '../../../lib/types'
import { DocumentUploader } from '../DocumentUploader'
import { useDraft } from '../draft'
import { SandboxPicker } from './sandbox'

export function EvidenceStep() {
  const { draft } = useDraft()
  switch (draft.pathway) {
    case 'income':
      return <IncomeEvidence />
    case 'net_worth':
      return <NetWorthEvidence />
    case 'license':
      return <LicenseEvidence />
    case 'min_investment':
      return <MinInvestmentEvidence />
    case 'entity_assets':
      return <EntityAssetsEvidence />
    default:
      return <p className="text-ink-2">Choose how you qualify first.</p>
  }
}

/* ---------------------------------------------------------------- Income */

function IncomeEvidence() {
  const { draft, dispatch } = useDraft()
  const th = incomeThreshold(draft.investorType ?? 'individual')
  const y = new Date().getFullYear()
  const rows = [
    { key: 'priorYear2' as const, label: String(y - 2) },
    { key: 'priorYear1' as const, label: String(y - 1) },
    { key: 'expectedCurrent' as const, label: `${y} (expected)` },
  ]
  return (
    <div className="grid gap-7">
      <div className="grid gap-5 sm:grid-cols-3">
        {rows.map((r) => {
          const v = draft.income[r.key]
          return (
            <Field key={r.key} label={r.label} hint={v == null ? undefined : <ThresholdHint ok={v >= th} text={v >= th ? 'Meets threshold' : `Below ${usd(th)}`} />}>
              <MoneyInput value={v} onChange={(n) => dispatch({ type: 'section', key: 'income', patch: { [r.key]: n } })} placeholder={th.toLocaleString()} />
            </Field>
          )
        })}
      </div>
      <DocumentUploader title="Tax documents" hint={`W-2, 1040, or K-1 · ${y - 2} and ${y - 1}`} />
    </div>
  )
}

function ThresholdHint({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', ok ? 'text-ok' : 'text-warn')}>
      {ok ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
      {text}
    </span>
  )
}

/* ---------------------------------------------------------------- Net worth */

function NetWorthEvidence() {
  const { draft, dispatch } = useDraft()
  const nw = draft.netWorth
  const set = (patch: Partial<typeof nw>) => dispatch({ type: 'section', key: 'netWorth', patch })
  const linked = draft.accountLink?.accounts.reduce((s, a) => s + a.balance, 0) ?? 0
  const statements = draft.documents.reduce((s, d) => s + (d.balance ?? 0), 0)
  const r = estimateNetWorth({
    verifiedAssets: linked + statements,
    otherAssets: nw.otherAssets ?? 0,
    liabilities: nw.liabilities ?? 0,
    primaryResidenceValue: nw.primaryResidenceValue ?? 0,
    primaryResidenceMortgage: nw.primaryResidenceMortgage ?? 0,
    mortgageIncreaseLast60Days: nw.mortgageIncreaseLast60Days ?? 0,
  })

  return (
    <div className="grid gap-7">
      <AccountLinker />

      {linked + statements > 0 && <NetWorthMeter verified={linked + statements} assets={r.assets} liabilities={r.liabilities} netWorth={r.netWorth} />}

      <details className="group" open={statements > 0 || undefined}>
        <summary className="link cursor-pointer list-none text-[16px] font-semibold marker:hidden">Upload statements instead</summary>
        <div className="mt-4">
          <DocumentUploader title="Statements" hint="Bank or brokerage, last 90 days" />
        </div>
      </details>

      <div className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Liabilities" hint="Excluding your mortgage">
            <MoneyInput value={nw.liabilities} onChange={(n) => set({ liabilities: n })} />
          </Field>
          <Field label="Other assets" optional>
            <MoneyInput value={nw.otherAssets} onChange={(n) => set({ otherAssets: n })} />
          </Field>
        </div>
        <details className="group rounded-[6px] border border-line open:pb-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] text-ink-2 marker:hidden">
            Mortgage above home value, or refinanced recently?
            <span className="text-[14px] text-link group-open:hidden">Add</span>
          </summary>
          <div className="grid gap-5 px-5 sm:grid-cols-3">
            <Field label="Home value">
              <MoneyInput value={nw.primaryResidenceValue} onChange={(n) => set({ primaryResidenceValue: n })} />
            </Field>
            <Field label="Mortgage balance">
              <MoneyInput value={nw.primaryResidenceMortgage} onChange={(n) => set({ primaryResidenceMortgage: n })} />
            </Field>
            <Field label="Added in last 60 days">
              <MoneyInput value={nw.mortgageIncreaseLast60Days} onChange={(n) => set({ mortgageIncreaseLast60Days: n })} />
            </Field>
          </div>
        </details>
      </div>
    </div>
  )
}

function NetWorthMeter({ verified, assets, liabilities, netWorth }: { verified: number; assets: number; liabilities: number; netWorth: number }) {
  const th = THRESHOLDS.netWorth
  const scale = Math.max(th * 1.6, assets)
  const pctNet = Math.max(0, Math.min(1, netWorth / scale))
  const pctVerified = Math.max(0, Math.min(pctNet, (verified - liabilities) / scale))
  const meets = netWorth >= th
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Estimated net worth</p>
          <div className="display tnum mt-2 text-[40px] leading-none text-ink">
            <NumberFlow value={netWorth} format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }} />
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={String(meets)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={cn('inline-flex items-center gap-1.5 text-[14px] font-medium', meets ? 'text-ok' : 'text-ink-3')}
          >
            {meets ? <CircleCheck className="size-4" /> : null}
            {meets ? 'Above $1M threshold' : `${usd(Math.max(0, th - netWorth))} to go`}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="relative mt-6 h-2.5 rounded-full bg-line">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-accent/35" animate={{ width: `${pctNet * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 22 }} />
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-accent" animate={{ width: `${pctVerified * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 22 }} />
        <div className="absolute -top-1.5 -bottom-1.5 w-px bg-ink" style={{ left: `${(th / scale) * 100}%` }}>
          <span className="absolute top-full mt-1.5 -translate-x-1/2 font-mono text-[10.5px] whitespace-nowrap text-ink-2">$1M</span>
        </div>
      </div>

      <dl className="mt-9 grid grid-cols-3 gap-4 border-t border-line pt-4 text-[14px]">
        <MeterStat k="Verified assets" v={verified} swatch="bg-accent" />
        <MeterStat k="Total assets" v={assets} swatch="bg-accent/35" />
        <MeterStat k="Liabilities" v={liabilities} />
      </dl>
    </div>
  )
}

function MeterStat({ k, v, swatch }: { k: string; v: number; swatch?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-ink-3">
        {swatch && <span className={cn('size-2 rounded-full', swatch)} />}
        {k}
      </dt>
      <dd className="tnum mt-1 font-mono text-[15px] text-ink">
        <NumberFlow value={v} format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }} />
      </dd>
    </div>
  )
}

const INSTITUTIONS = ['Chase', 'Fidelity', 'Charles Schwab', 'Vanguard', 'Morgan Stanley', 'Bank of America', 'Wells Fargo', 'J.P. Morgan']

function AccountLinker() {
  const { draft, dispatch } = useDraft()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [scenario, setScenario] = useState<AccountScenario>('high')
  const link = draft.accountLink

  const connect = async (inst: string) => {
    setBusy(inst)
    try {
      const l = await api.linkAccounts(scenario)
      dispatch({ type: 'patch', patch: { accountLink: l } })
      setOpen(false)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-3">
      {link ? (
        <div className="overflow-hidden rounded-xl border border-line bg-raised">
          <ul className="divide-y divide-line">
            {link.accounts.map((a, i) => (
              <motion.li key={a.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="flex items-center gap-3 px-4 py-3.5">
                <span className="grid size-8 place-items-center rounded-lg border border-line bg-surface font-mono text-[11px] text-ink-2">{a.institution.slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] text-ink">{a.name}</p>
                  <p className="text-[12px] text-ink-3 capitalize">
                    {a.institution} · {a.kind}
                  </p>
                </div>
                <span className="tnum font-mono text-[15px] text-ink">{usd(a.balance)}</span>
              </motion.li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-line bg-surface px-4 py-2.5">
            <button type="button" className="text-[14px] text-ink-3 underline decoration-line-strong underline-offset-4 hover:text-ink" onClick={() => dispatch({ type: 'patch', patch: { accountLink: null } })}>
              Disconnect
            </button>
            <button type="button" className="text-[14px] text-ink-2 hover:text-ink" onClick={() => setOpen(true)}>
              + Add institution
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="group flex items-center gap-4 rounded-xl border border-line bg-raised px-4 py-4 text-left transition-colors hover:border-line-strong">
          <span className="grid size-10 place-items-center rounded-lg bg-accent text-on-accent">
            <Link2 className="size-4" />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-medium text-ink">Link your accounts</span>
            <span className="block text-[14px] text-ink-3">Read-only. We can&rsquo;t move money.</span>
          </span>
          <span className="text-ink-3 transition-transform group-hover:translate-x-0.5">&rarr;</span>
        </button>
      )}

      <Dialog.Root open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AnimatePresence>
          {open && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount>
                <motion.div className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount>
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } }}
                  className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-line bg-raised shadow-lift focus:outline-none"
                >
                  <div className="px-6 pt-6">
                    <Dialog.Title className="display text-[22px] text-ink">Select your institution</Dialog.Title>
                    <Dialog.Description className="mt-1 text-[15px] text-ink-2">Sign in on your bank&rsquo;s own page. We never see your password.</Dialog.Description>
                    <div className="relative mt-5">
                      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
                      <Input autoFocus placeholder="Search" className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} />
                    </div>
                  </div>
                  <ul className="mt-3 max-h-72 overflow-y-auto px-3 pb-3">
                    {INSTITUTIONS.filter((i) => i.toLowerCase().includes(q.toLowerCase())).map((inst) => (
                      <li key={inst}>
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => connect(inst)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] text-ink transition-colors hover:bg-ink/[0.04] disabled:opacity-50"
                        >
                          <span className="grid size-8 place-items-center rounded-lg border border-line bg-surface font-mono text-[11px] text-ink-2">{inst.slice(0, 2).toUpperCase()}</span>
                          {inst}
                          {busy === inst && <Loader2 className="ml-auto size-4 animate-spin text-ink-3" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {isMock && (
                    <div className="border-t border-line p-3">
                      <SandboxPicker value={scenario} onChange={setScenario} options={[{ id: 'high', label: '$1.5M' }, { id: 'low', label: '$300K' }]} label="Balances" />
                    </div>
                  )}
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </div>
  )
}

/* ---------------------------------------------------------------- License */

const LICENSES: { id: LicenseType; label: string; sub: string }[] = [
  { id: 'series7', label: 'Series 7', sub: 'General securities' },
  { id: 'series65', label: 'Series 65', sub: 'Investment adviser' },
  { id: 'series82', label: 'Series 82', sub: 'Private placements' },
]

function LicenseEvidence() {
  const { draft, dispatch } = useDraft()
  const lic = draft.license
  const [busy, setBusy] = useState(false)
  const crdId = useId()
  const set = (patch: Partial<typeof lic>) => dispatch({ type: 'section', key: 'license', patch })

  const lookup = async () => {
    setBusy(true)
    try {
      set({ lookup: await api.checkLicense(lic.type, lic.crd) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-7">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="License">
        {LICENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={lic.type === l.id}
            onClick={() => set({ type: l.id, lookup: null })}
            className={cn(
              'rounded-xl border px-4 py-3.5 text-left transition-[border-color,box-shadow]',
              lic.type === l.id ? 'border-accent bg-raised shadow-[0_0_0_1px_var(--accent)]' : 'border-line bg-raised hover:border-line-strong',
            )}
          >
            <span className="block text-[16px] font-medium text-ink">{l.label}</span>
            <span className="block text-[14px] text-ink-3">{l.sub}</span>
          </button>
        ))}
      </div>
      <Field label="FINRA CRD number" htmlFor={crdId} hint={isMock ? 'Sandbox: CRDs starting with 9 aren’t found' : undefined}>
        <div className="flex gap-2">
          <Input id={crdId} inputMode="numeric" className="tnum font-mono" value={lic.crd} maxLength={8} onChange={(e) => set({ crd: e.target.value.replace(/\D/g, ''), lookup: null })} placeholder="1234567" />
          <Button variant="secondary" className="h-11 shrink-0" onClick={lookup} loading={busy} disabled={!/^\d{4,8}$/.test(lic.crd)}>
            Look up
          </Button>
        </div>
      </Field>
      <AnimatePresence>
        {lic.lookup && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={cn('flex items-center gap-3 rounded-xl border px-4 py-3.5', lic.lookup.found ? 'border-ok/30 bg-ok-soft' : 'border-danger/30 bg-danger-soft')}>
            {lic.lookup.found ? <CircleCheck className="size-5 text-ok" /> : <CircleX className="size-5 text-danger" />}
            <p className="text-[15px] text-ink">
              {lic.lookup.found ? `Active ${LICENSES.find((l) => l.id === lic.type)?.label} found on BrokerCheck for CRD ${lic.crd}.` : `No active registration found for CRD ${lic.crd}. Check the number and try again.`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------------------------------------------------------------- Minimum investment */

function MinInvestmentEvidence() {
  const { draft, dispatch } = useDraft()
  const th = minInvestmentThreshold(draft.investorType ?? 'individual')
  const v = draft.minInvestment.commitment
  return (
    <div className="grid gap-6">
      <Field label="Commitment amount" hint={v == null ? `${usd(th)} minimum · nothing to upload` : <ThresholdHint ok={v >= th} text={v >= th ? 'Meets the minimum' : `Below ${usd(th)}`} />}>
        <MoneyInput value={v} onChange={(n) => dispatch({ type: 'section', key: 'minInvestment', patch: { commitment: n } })} placeholder={th.toLocaleString()} />
      </Field>
      <Checkbox id="not-financed" checked={draft.attestations.notThirdPartyFinanced} onChange={(c) => dispatch({ type: 'section', key: 'attestations', patch: { notThirdPartyFinanced: c } })}>
        <span className="text-ink">These funds aren&rsquo;t borrowed or financed by anyone else for this investment.</span>
      </Checkbox>
    </div>
  )
}

/* ---------------------------------------------------------------- Entity assets */

function EntityAssetsEvidence() {
  const { draft, dispatch } = useDraft()
  const ea = draft.entityAssets
  const set = (patch: Partial<typeof ea>) => dispatch({ type: 'section', key: 'entityAssets', patch })
  return (
    <div className="grid gap-8">
      <Field label="Entity total assets" hint={ea.totalAssets == null ? undefined : <ThresholdHint ok={ea.totalAssets > THRESHOLDS.entityAssets} text={ea.totalAssets > THRESHOLDS.entityAssets ? 'Above $5M' : 'Must exceed $5M'} />}>
        <MoneyInput value={ea.totalAssets} onChange={(n) => set({ totalAssets: n })} placeholder="5,000,000" />
      </Field>
      <Checkbox id="formed" checked={ea.formedForPurpose} onChange={(v) => set({ formedForPurpose: v })}>
        <span className="text-ink">Formed specifically for this investment</span>
      </Checkbox>
      <DocumentUploader title="Supporting documents" hint="Financial statements or CPA letter" />
    </div>
  )
}
