import NumberFlow from '@number-flow/react'
import { ArrowRight, BadgeCheck, ChevronRight, RefreshCw } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/misc'
import { ValidityRing } from '../components/ValidityRing'
import { api } from '../lib/api/client'
import { useAuth } from '../lib/auth'
import { daysUntil, longDate, shortDate, usd } from '../lib/format'
import { PATHWAY_LABEL, type Fund, type Investment, type InvestmentStatus, type Passport, type Share } from '../lib/types'

const STATUS: Record<InvestmentStatus, { label: string; tone: 'brass' | 'ok' | 'neutral' }> = {
  committed: { label: 'Committed', tone: 'brass' },
  funded: { label: 'Funded', tone: 'ok' },
  closed: { label: 'Closed', tone: 'neutral' },
}

export default function InvestorDashboard() {
  const { user } = useAuth()
  const [passport, setPassport] = useState<{ passport: Passport; active: boolean } | null | undefined>(undefined)
  const [investments, setInvestments] = useState<Investment[] | null>(null)
  const [shares, setShares] = useState<Share[]>([])
  const [funds, setFunds] = useState<Fund[]>([])

  useEffect(() => {
    if (!user) return
    if (user.passportId) {
      api.getPassport(user.passportId).then(setPassport, () => setPassport(null))
      api.listShares(user.passportId).then(setShares, () => {})
    } else setPassport(null)
    api.listInvestments().then(setInvestments, () => setInvestments([]))
    api.listFunds().then(setFunds, () => {})
  }, [user])

  if (!user) return null
  const first = user.name.split(' ')[0]
  const total = investments?.reduce((n, i) => n + i.amount, 0) ?? 0
  const open = investments?.filter((i) => i.status !== 'closed').length ?? 0

  return (
    <div className="min-h-[70vh] bg-surface">
      <div className="mx-auto max-w-6xl px-5 pt-10 pb-6 sm:px-8 sm:pt-12">
        <h1 className="display text-[clamp(30px,4vw,40px)] text-ink">Welcome back, {first}</h1>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          {/* Passport */}
          {passport === undefined ? (
            <div className="h-[220px] animate-pulse border border-line bg-raised" />
          ) : passport ? (
            <PassportTile p={passport.passport} active={passport.active} />
          ) : (
            <div className="flex flex-col justify-between gap-6 border border-line bg-raised p-7 shadow-card">
              <div>
                <p className="eyebrow">Passport</p>
                <h2 className="mt-2 text-[22px] font-semibold text-ink">Get verified to invest</h2>
                <p className="mt-1 text-[16px] text-ink-2">About 10 minutes. Funds see your status, never your documents.</p>
              </div>
              <Link to="/get-started">
                <Button size="lg">
                  Start verifying <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          )}

          {/* Totals */}
          <div className="grid grid-cols-2 gap-px overflow-hidden border border-line bg-line shadow-card">
            <Stat label="Total committed" wide>
              <NumberFlow value={total} format={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }} />
            </Stat>
            <Stat label="Active investments">
              <NumberFlow value={open} />
            </Stat>
            <Stat label="Funds with access">
              <NumberFlow value={shares.length} />
            </Stat>
          </div>
        </div>

        {/* Investments */}
        <section className="mt-8 border border-line bg-raised shadow-card">
          <div className="flex items-center justify-between px-6 py-5">
            <h2 className="text-[20px] font-semibold text-ink">Investments</h2>
            {passport && (
              <Link to={`/passport/${passport.passport.id}/deals`} className="link inline-flex items-center gap-0.5 text-[15px] font-semibold">
                Browse open deals <ChevronRight className="size-4" />
              </Link>
            )}
          </div>
          {investments === null ? (
            <div className="space-y-px border-t border-line">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse bg-surface" />)}</div>
          ) : investments.length === 0 ? (
            <p className="border-t border-line px-6 py-10 text-center text-[16px] text-ink-3">{passport ? 'No investments yet.' : 'Your investments appear here once you’re verified.'}</p>
          ) : (
            <table className="w-full border-t border-line text-left">
              <thead className="hidden bg-surface text-[13px] font-semibold tracking-wide text-ink-3 uppercase sm:table-header-group">
                <tr>
                  <th className="px-6 py-3 font-semibold">Fund</th>
                  <th className="px-6 py-3 text-right font-semibold">Amount</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Committed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {investments.map((inv, i) => (
                  <motion.tr key={inv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }} className="grid grid-cols-2 gap-1 px-6 py-4 sm:table-row sm:p-0">
                    <td className="col-span-2 sm:px-6 sm:py-4">
                      <p className="text-[16px] font-semibold text-ink">{inv.fundName}</p>
                      <p className="text-[14px] text-ink-3">{inv.manager}</p>
                    </td>
                    <td className="tnum text-[16px] text-ink sm:px-6 sm:py-4 sm:text-right">{usd(inv.amount)}</td>
                    <td className="justify-self-end sm:px-6 sm:py-4">
                      <Badge tone={STATUS[inv.status].tone} dot>
                        {STATUS[inv.status].label}
                      </Badge>
                    </td>
                    <td className="hidden text-[15px] text-ink-2 sm:table-cell sm:px-6 sm:py-4">{shortDate(inv.committedAt)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Funds with access */}
        {passport && (
          <section className="mt-8 border border-line bg-raised shadow-card">
            <div className="flex items-center justify-between px-6 py-5">
              <h2 className="text-[20px] font-semibold text-ink">Funds with access to your passport</h2>
              <Link to={`/passport/${passport.passport.id}/deals`} className="link text-[15px] font-semibold">
                Manage
              </Link>
            </div>
            {shares.length === 0 ? (
              <p className="border-t border-line px-6 py-8 text-[16px] text-ink-3">None yet. Funds you share with see your status and expiry, nothing else.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {shares.map((s) => {
                  const f = funds.find((x) => x.id === s.fundId)
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-4 px-6 py-4">
                      <span className="text-[16px] text-ink">{f?.name ?? s.fundId}</span>
                      <span className="text-[14px] text-ink-3">
                        Shared {shortDate(s.createdAt)} · {s.views.length} view{s.views.length === 1 ? '' : 's'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function PassportTile({ p, active }: { p: Passport; active: boolean }) {
  const left = daysUntil(p.expiresAt)
  const renew = !active || left <= 14
  return (
    <div className="flex flex-col gap-6 border border-line bg-raised p-7 shadow-card sm:flex-row sm:items-center">
      <div className="relative grid shrink-0 place-items-center">
        <ValidityRing daysLeft={left} size={112} />
        <div className="absolute text-center">
          <p className="display tnum text-[32px] leading-none text-ink">{left}</p>
          <p className="text-[13px] text-ink-3">days left</p>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="eyebrow">Passport</p>
          {active ? <Badge tone="ok" dot>Verified</Badge> : <Badge tone="danger" dot>Expired</Badge>}
        </div>
        <p className="mt-2 flex items-center gap-2 text-[20px] font-semibold text-ink">
          <BadgeCheck className="size-5 text-accent" strokeWidth={1.75} /> {PATHWAY_LABEL[p.pathway]}
        </p>
        <p className="mt-1 text-[15px] text-ink-2">{active ? `Valid until ${longDate(p.expiresAt)}` : `Expired ${longDate(p.expiresAt)}`}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {renew ? (
            <Link to="/get-started">
              <Button>
                <RefreshCw className="size-4" /> Re-verify
              </Button>
            </Link>
          ) : (
            <Link to={`/passport/${p.id}/deals`}>
              <Button>Share with a fund</Button>
            </Link>
          )}
          <Link to={`/passport/${p.id}`}>
            <Button variant="secondary">View passport</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 bg-raised px-7 py-6' : 'bg-raised px-7 py-6'}>
      <p className="text-[15px] text-ink-3">{label}</p>
      <p className="display tnum mt-2 text-[36px] leading-none text-ink">{children}</p>
    </div>
  )
}
