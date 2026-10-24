import NumberFlow from '@number-flow/react'
import { ArrowRight, Copy, FileDown, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChecksList } from '../components/ChecksList'
import { EvidencePanel } from '../components/EvidencePanel'
import { PassportCard } from '../components/PassportCard'
import { Button } from '../components/ui/button'
import { Badge, Card } from '../components/ui/misc'
import { ValidityRing } from '../components/ValidityRing'
import { api } from '../lib/api/client'
import { downloadLetter } from '../lib/letter'
import { daysUntil, longDate } from '../lib/format'
import { INVESTOR_TYPE_LABEL, PATHWAY_LABEL, type Fund, type Passport, type Share } from '../lib/types'
import { PassportSkeleton } from '../components/ui/skeleton'

export default function PassportPage() {
  const { id = '' } = useParams()
  const [data, setData] = useState<{ passport: Passport; active: boolean } | null>(null)
  const [shares, setShares] = useState<Share[]>([])
  const [funds, setFunds] = useState<Fund[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getPassport(id).then(setData, (e) => setError(e.message))
    api.listShares(id).then(setShares, () => {})
    api.listFunds().then(setFunds, () => {})
  }, [id])

  if (error)
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="display text-3xl text-ink">Passport not found</h1>
        <p className="mt-3 text-ink-2">{error}</p>
      </div>
    )
  if (!data) return <PassportSkeleton />

  const { passport: p, active } = data
  const left = daysUntil(p.expiresAt)
  const renewSoon = left <= 14

  return (
    <div className="mx-auto max-w-6xl px-5 pt-10 pb-10 sm:px-8 sm:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Investor passport</p>
          <h1 className="display mt-2 text-[clamp(30px,4.4vw,44px)] leading-[1.05] text-ink">{p.holderName}</h1>
        </div>
        {active ? <Badge tone="ok" dot>Active</Badge> : <Badge tone="danger" dot>Expired</Badge>}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        <div>
          <PassportCard data={{ ...p, status: active ? 'active' : 'expired' }} />
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={`/passport/${p.id}/deals`}>
              <Button size="lg">
                Share with a fund <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Button
              size="lg"
              variant="secondary"
              onClick={() =>
                downloadLetter({ holderName: p.holderName, investorType: p.investorType, pathway: p.pathway, letterRef: p.letterRef, verifiedAt: p.issuedAt, expiresAt: p.expiresAt, checks: p.checks }).then(
                  () => toast.success('Letter downloaded'),
                  () => toast.error('Couldn’t create the letter'),
                )
              }
            >
              <FileDown className="size-4" /> Verification letter
            </Button>
          </div>
        </div>

        <div className="grid content-start gap-5">
          <Card className="p-6">
            <div className="flex items-center gap-6">
              <ValidityRing daysLeft={left} />
              <div>
                <p className="eyebrow">Valid for</p>
                <p className="display tnum mt-1.5 text-[34px] leading-none text-ink">
                  <NumberFlow value={left} /> <span className="text-[18px] text-ink-2">days</span>
                </p>
                <p className="mt-2 text-[14px] text-ink-3">Expires {longDate(p.expiresAt)}</p>
              </div>
            </div>
            {!active && (
              <Link to="/get-started" className="mt-5 flex items-center justify-between rounded-[6px] bg-warn-soft px-4 py-3 text-[15px] text-ink">
                <span>This verification is past its window. Re-verify in about a minute.</span>
                <RefreshCw className="size-4 text-warn" />
              </Link>
            )}
            {active && renewSoon && (
              <Link to="/verify" className="mt-5 flex items-center justify-between rounded-xl bg-brass-soft px-4 py-3 text-[15px] text-ink">
                <span>Refresh now so your next close isn&rsquo;t held up.</span>
                <RefreshCw className="size-4 text-brass" />
              </Link>
            )}
          </Card>

          <Card className="divide-y divide-line">
            <Row k="Verified as" v={INVESTOR_TYPE_LABEL[p.investorType]} />
            <Row k="Basis" v={PATHWAY_LABEL[p.pathway]} />
            <Row k="Issued" v={longDate(p.issuedAt)} />
            <Row
              k="Letter reference"
              v={
                <button
                  type="button"
                  className="group inline-flex items-center gap-2 font-mono text-[14px] text-ink"
                  onClick={() => {
                    navigator.clipboard?.writeText(p.letterRef).then(() => toast.success('Reference copied'), () => {})
                  }}
                >
                  {p.letterRef}
                  <Copy className="size-3.5 text-ink-3 transition-colors group-hover:text-ink" />
                </button>
              }
            />
          </Card>

          <Card className="p-6">
            <div className="flex items-baseline justify-between">
              <p className="text-[16px] font-medium text-ink">Shared with</p>
              <Link to={`/passport/${p.id}/deals`} className="text-[14px] text-ink-3 underline decoration-line-strong underline-offset-4 hover:text-ink">
                Manage
              </Link>
            </div>
            {shares.length === 0 ? (
              <p className="mt-3 text-[15px] text-ink-3">No funds yet. Funds you share with see your status and expiry, nothing else.</p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {shares.map((s) => {
                  const f = funds.find((x) => x.id === s.fundId)
                  return (
                    <li key={s.id} className="flex items-center justify-between text-[15px]">
                      <span className="text-ink">{f?.name ?? s.fundId}</span>
                      <span className="text-ink-3">{s.views.length} view{s.views.length === 1 ? '' : 's'}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <section className="mt-16">
        <h2 className="text-[16px] font-medium text-ink">Audit trail</h2>
        <p className="mt-1 text-[15px] text-ink-3">The checks behind your letter. Funds can request this file as evidence of reasonable steps under Rule 506(c).</p>
        <ChecksList checks={p.checks} className="mt-5" />
        <EvidencePanel className="mt-10" checks={p.checks} pathway={p.pathway} investorType={p.investorType} />
      </section>
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-3.5">
      <span className="text-[14px] text-ink-3">{k}</span>
      <span className="text-[15px] text-ink">{v}</span>
    </div>
  )
}
