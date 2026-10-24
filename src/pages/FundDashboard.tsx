import NumberFlow from '@number-flow/react'
import { Check, ChevronRight, CircleAlert, CircleCheck, CircleX, Copy, EyeOff, FileDown, Search, Send, ShieldCheck, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog } from 'radix-ui'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { InviteDialog } from '../features/fund/InviteDialog'
import { Badge } from '../components/ui/misc'
import { api } from '../lib/api/client'
import { cn } from '../lib/cn'
import { compactUsd, dateTime, longDate, shortDate, usd } from '../lib/format'
import { INVESTOR_TYPE_LABEL, PATHWAY_LABEL, type IncomingInvestor, type IncomingStatus, type IssuerOverview } from '../lib/types'

const STATUS: Record<IncomingStatus, { label: string; tone: 'ok' | 'warn' | 'neutral' | 'danger' }> = {
  verified: { label: 'Cleared', tone: 'ok' },
  review: { label: 'Under review', tone: 'warn' },
  needs_info: { label: 'Needs info', tone: 'warn' },
  invited: { label: 'Invited', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'danger' },
}

type Filter = 'all' | 'cleared' | 'review' | 'action'
const FILTERS: { id: Filter; label: string; match: (s: IncomingStatus) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'cleared', label: 'Cleared', match: (s) => s === 'verified' },
  { id: 'review', label: 'Under review', match: (s) => s === 'review' },
  { id: 'action', label: 'Needs action', match: (s) => s === 'needs_info' || s === 'invited' || s === 'expired' },
]

const needsNudge = (s: IncomingStatus) => s === 'needs_info' || s === 'invited' || s === 'expired'

export default function FundDashboard() {
  const [data, setData] = useState<IssuerOverview | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<IncomingInvestor | null>(null)
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    api.getIssuerOverview().then(setData)
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    const f = FILTERS.find((x) => x.id === filter)!
    const needle = q.trim().toLowerCase()
    return data.investors.filter((i) => f.match(i.status) && (!needle || i.name.toLowerCase().includes(needle)))
  }, [data, filter, q])

  if (!data) {
    return (
      <div className="min-h-[70vh] bg-surface">
        <div className="mx-auto max-w-6xl space-y-5 px-5 pt-12 sm:px-8">
          <div className="h-10 w-72 animate-pulse bg-line" />
          <div className="h-32 animate-pulse bg-line" />
          <div className="h-96 animate-pulse bg-line" />
        </div>
      </div>
    )
  }

  const inv = data.investors
  const cleared = inv.filter((i) => i.status === 'verified')
  const pending = inv.filter((i) => needsNudge(i.status))
  const clearedAmt = cleared.reduce((n, i) => n + i.commitment, 0)
  const totalAmt = inv.reduce((n, i) => n + i.commitment, 0)

  const nudge = async (list: IncomingInvestor[]) => {
    await Promise.all(list.map((i) => api.nudgeInvestor(i.id)))
    toast.success(list.length === 1 ? `Reminder sent to ${list[0].name}` : `Reminders sent to ${list.length} investors`)
    setData(await api.getIssuerOverview())
  }

  return (
    <div className="min-h-[70vh] bg-surface">
      <div className="mx-auto max-w-6xl px-5 pt-10 pb-6 sm:px-8 sm:pt-12">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Fund dashboard</p>
            <h1 className="display mt-2 text-[clamp(30px,4vw,40px)] text-ink">{data.fund.name}</h1>
            <p className="mt-1 text-[16px] text-ink-3">
              {data.fund.manager} · Rule {data.fund.offering} · Closes {data.fund.closing === 'Rolling' ? 'rolling' : longDate(data.fund.closing)}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[15px] text-ok">
              <ShieldCheck className="size-4" /> Every investor Savy clears is covered by the Savy Verification Guarantee.
            </p>
          </div>
          <div className="flex w-full max-w-md flex-col gap-3">
            <Button size="lg" onClick={() => setInviting(true)} className="self-start sm:self-end">
              <Send className="size-4" /> Invite LPs
            </Button>
            <InviteLink url={data.inviteUrl} />
          </div>
        </div>

        {/* Close readiness */}
        <section className="mt-8 grid gap-px overflow-hidden border border-line bg-line shadow-card lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="bg-raised px-7 py-6">
            <p className="text-[15px] text-ink-3">Ready to close</p>
            <p className="display tnum mt-2 text-[36px] leading-none text-ink">
              <NumberFlow value={cleared.length} />
              <span className="text-[20px] text-ink-3"> of {inv.length} investors</span>
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
              <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${(cleared.length / Math.max(1, inv.length)) * 100}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
            </div>
            <p className="tnum mt-2 text-[14px] text-ink-3">
              {compactUsd(clearedAmt)} of {compactUsd(totalAmt)} committed is cleared
            </p>
          </div>
          <Tile label="Cleared" value={cleared.length} tone="ok" />
          <Tile label="Under review" value={inv.filter((i) => i.status === 'review').length} tone="warn" />
          <Tile label="Needs action" value={pending.length} tone="danger" />
        </section>

        {pending.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-warn/30 bg-warn-soft px-5 py-3.5">
            <p className="text-[16px] text-ink">
              {pending.length} investors still verifying. We&rsquo;ll nudge them so you don&rsquo;t have to.
            </p>
            <Button size="sm" variant="secondary" onClick={() => nudge(pending)}>
              <Send className="size-3.5" /> Nudge all
            </Button>
          </div>
        )}

        {/* Investors */}
        <section className="mt-5 border border-line bg-raised shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div role="tablist" className="flex flex-wrap gap-1">
              {FILTERS.map((f) => {
                const n = inv.filter((i) => f.match(i.status)).length
                const on = f.id === filter
                return (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={on}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={cn('rounded-[4px] px-3 py-1.5 text-[15px] transition-colors', on ? 'bg-accent text-on-accent' : 'text-ink-2 hover:bg-ink/5')}
                  >
                    {f.label} <span className={cn('tnum', on ? 'text-on-accent/70' : 'text-ink-3')}>{n}</span>
                  </button>
                )
              })}
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search investors"
                aria-label="Search investors"
                className="h-10 w-full rounded-[4px] border border-line-strong bg-raised pr-3 pl-9 text-[15px] text-ink placeholder:text-ink-3/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-t border-line text-left">
              <thead className="bg-surface text-[13px] font-semibold tracking-wide text-ink-3 uppercase">
                <tr>
                  <th className="px-6 py-3 font-semibold">Investor</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Basis</th>
                  <th className="px-4 py-3 font-semibold">Valid until</th>
                  <th className="px-4 py-3 text-right font-semibold">Commitment</th>
                  <th className="px-4 py-3 font-semibold">Last activity</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <AnimatePresence initial={false}>
                  {rows.map((i) => (
                    <motion.tr
                      key={i.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setOpen(i)}
                      className="cursor-pointer transition-colors hover:bg-surface"
                    >
                      <td className="px-6 py-4">
                        <button type="button" className="text-left text-[16px] font-semibold text-ink hover:text-link" onClick={(e) => (e.stopPropagation(), setOpen(i))}>
                          {i.name}
                        </button>
                        <p className="text-[14px] text-ink-3">{INVESTOR_TYPE_LABEL[i.investorType]}</p>
                      </td>
                      <td className="px-4 py-4">
                        <Badge tone={STATUS[i.status].tone} dot>
                          {STATUS[i.status].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-[15px] text-ink-2">{i.pathway ? PATHWAY_LABEL[i.pathway] : '—'}</td>
                      <td className="tnum px-4 py-4 text-[15px] text-ink-2">{i.expiresAt ? shortDate(i.expiresAt) : '—'}</td>
                      <td className="tnum px-4 py-4 text-right text-[15px] text-ink">{i.commitment ? usd(i.commitment) : '—'}</td>
                      <td className="px-4 py-4 text-[14px] text-ink-3">{dateTime(i.lastActivityAt)}</td>
                      <td className="pr-4 text-ink-3">
                        <ChevronRight className="size-4" />
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
            {rows.length === 0 && <p className="border-t border-line px-6 py-10 text-center text-[16px] text-ink-3">No investors match.</p>}
          </div>
        </section>
      </div>

      <InvestorSheet investor={open} onClose={() => setOpen(null)} onNudge={(i) => nudge([i])} />
      <InviteDialog fund={data.fund} open={inviting} onOpenChange={setInviting} onSent={() => api.getIssuerOverview().then(setData)} />
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className="bg-raised px-7 py-6">
      <p className="flex items-center gap-2 text-[15px] text-ink-3">
        <span className={cn('size-2 rounded-full', tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : 'bg-danger')} />
        {label}
      </p>
      <p className="display tnum mt-2 text-[36px] leading-none text-ink">
        <NumberFlow value={value} />
      </p>
    </div>
  )
}

function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="w-full max-w-md">
      <p className="text-[14px] font-semibold text-ink">Or share one link with everyone</p>
      <div className="mt-1.5 flex">
        <input readOnly value={url} aria-label="Investor invite link" onFocus={(e) => e.target.select()} className="h-11 min-w-0 flex-1 rounded-l-[4px] border border-r-0 border-line-strong bg-raised px-3 font-mono text-[13px] text-ink-2 focus:outline-none" />
        <Button
          className="h-11 rounded-l-none"
          onClick={() =>
            navigator.clipboard?.writeText(url).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            })
          }
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}

const RESULT_ICON = {
  pass: <CircleCheck className="size-5 text-ok" />,
  warn: <CircleAlert className="size-5 text-warn" />,
  fail: <CircleX className="size-5 text-danger" />,
}

function InvestorSheet({ investor: i, onClose, onNudge }: { investor: IncomingInvestor | null; onClose: () => void; onNudge: (i: IncomingInvestor) => void }) {
  return (
    <Dialog.Root open={!!i} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {i && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-ink/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.aside
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%', transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col bg-raised shadow-lift focus:outline-none"
              >
                <div className="flex items-start justify-between gap-4 border-b border-line px-7 py-6">
                  <div className="min-w-0">
                    <Badge tone={STATUS[i.status].tone} dot>
                      {STATUS[i.status].label}
                    </Badge>
                    <Dialog.Title className="display mt-3 truncate text-[28px] text-ink">{i.name}</Dialog.Title>
                    <p className="text-[15px] text-ink-3">
                      {INVESTOR_TYPE_LABEL[i.investorType]}{i.commitment ? ` · ${usd(i.commitment)} commitment` : ''}
                    </p>
                  </div>
                  <Dialog.Close className="-m-1.5 rounded-[4px] p-1.5 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label="Close">
                    <X className="size-5" />
                  </Dialog.Close>
                </div>

                <div className="flex-1 overflow-y-auto px-7 py-6">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                    <Fact k="Basis" v={i.pathway ? PATHWAY_LABEL[i.pathway] : '—'} />
                    <Fact k="Verified on" v={i.verifiedAt ? shortDate(i.verifiedAt) : '—'} />
                    <Fact k="Valid until" v={i.expiresAt ? shortDate(i.expiresAt) : '—'} />
                    <Fact k="Letter reference" v={i.letterRef ?? '—'} mono />
                  </dl>

                  <h3 className="mt-8 text-[16px] font-semibold text-ink">Verification checks</h3>
                  {i.checks.length === 0 ? (
                    <p className="mt-3 text-[15px] text-ink-3">Invited {dateTime(i.lastActivityAt)}. Hasn&rsquo;t started yet.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-line border-y border-line">
                      {i.checks.map((c) => (
                        <li key={c.id} className="flex items-center gap-3 py-3 text-[15px] text-ink">
                          {RESULT_ICON[c.result]}
                          {c.label}
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="mt-6 flex items-start gap-2.5 bg-surface px-4 py-3 text-[14px] text-ink-2">
                    <EyeOff className="mt-0.5 size-4 shrink-0 text-ink-3" />
                    Savy never shares an investor&rsquo;s documents, balances or income, only whether they passed.
                  </p>
                </div>

                <div className="flex gap-3 border-t border-line px-7 py-5">
                  {i.status === 'verified' ? (
                    <Button className="flex-1" onClick={() => toast('Verification letter', { description: `${i.letterRef} · PDF comes from the backend.` })}>
                      <FileDown className="size-4" /> Verification letter
                    </Button>
                  ) : needsNudge(i.status) ? (
                    <Button className="flex-1" onClick={() => onNudge(i)}>
                      <Send className="size-4" /> {i.status === 'expired' ? 'Ask to re-verify' : 'Send reminder'}
                    </Button>
                  ) : (
                    <p className="flex-1 text-[15px] text-ink-3">Under review. Usually within a few hours.</p>
                  )}
                </div>
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-ink-3">{k}</dt>
      <dd className={cn('mt-0.5 truncate text-[16px] text-ink', mono && 'font-mono text-[14px]')}>{v}</dd>
    </div>
  )
}
