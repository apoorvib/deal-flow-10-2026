import { ArrowLeft, Check, Eye, EyeOff, Send } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog } from 'radix-ui'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/misc'
import { api } from '../lib/api/client'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/cn'
import { compactUsd, dateTime, shortDate } from '../lib/format'
import type { Fund, Passport, Share } from '../lib/types'
import { PATHWAY_LABEL } from '../lib/types'
import { DealsSkeleton } from '../components/ui/skeleton'

export default function Deals() {
  const { id = '' } = useParams()
  const [passport, setPassport] = useState<{ passport: Passport; active: boolean } | null>(null)
  const [funds, setFunds] = useState<Fund[] | null>(null)
  const [shares, setShares] = useState<Share[]>([])
  const [confirming, setConfirming] = useState<Fund | null>(null)
  const [busy, setBusy] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    api.getPassport(id).then(setPassport, () => {})
    api.listFunds().then(setFunds)
    api.listShares(id).then(setShares)
  }, [id])

  const share = async (f: Fund) => {
    setBusy(true)
    try {
      const s = await api.sharePassport(id, f.id)
      setShares((x) => [...x.filter((y) => y.id !== s.id), s])
      setConfirming(null)
      toast.success(`Shared with ${f.name}`, { description: 'Their compliance team can now confirm your status.' })
    } catch (e) {
      toast.error('Couldn’t share', { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (s: Share, f: Fund) => {
    await api.revokeShare(id, s.id)
    setShares((x) => x.filter((y) => y.id !== s.id))
    toast(`Access removed for ${f.name}`)
  }

  return (
    <div className="mx-auto max-w-4xl px-5 pt-10 pb-10 sm:px-8 sm:pt-14">
      <Link to={`/passport/${id}`} className="inline-flex items-center gap-1.5 text-[14px] text-ink-3 transition-colors hover:text-ink">
        <ArrowLeft className="size-3.5" /> Passport
      </Link>
      <h1 className="display mt-4 text-[clamp(30px,4.4vw,44px)] leading-[1.05] text-ink">Open allocations</h1>
      <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-ink-2">These funds accept your passport. Sharing gives their compliance team your verified status, so you can skip their accreditation paperwork.</p>

      {!funds && <DealsSkeleton />}
      <ul className="mt-10 grid gap-3">

        {funds?.filter((f) => f.id !== user?.fundId).map((f, i) => {
          const s = shares.find((x) => x.fundId === f.id)
          return (
            <motion.li key={f.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} layout className={cn('rounded-2xl border bg-raised transition-colors', s ? 'border-accent/30' : 'border-line')}>
              <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
                <div className="flex min-w-0 flex-1 gap-4">
                  <span className="display grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface text-[17px] text-ink-2">{f.name.charAt(0)}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[17px] font-medium text-ink">{f.name}</h3>
                      <Badge tone="neutral" className="font-mono text-[10.5px]">
                        {f.offering}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[15px] text-ink-2">
                      {f.manager} · {f.strategy}
                    </p>
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] text-ink-3">
                      <span>Min {compactUsd(f.minCheck)}</span>
                      <span>Closes {f.closing === 'Rolling' ? 'rolling' : shortDate(f.closing)}</span>
                    </p>
                  </div>
                </div>
                <div className="shrink-0">
                  {s ? (
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ok">
                        <Check className="size-4" strokeWidth={2.5} /> Shared
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => revoke(s, f)}>
                        Revoke
                      </Button>
                    </div>
                  ) : (
                    <Button variant="secondary" onClick={() => setConfirming(f)} disabled={passport ? !passport.active : true}>
                      <Send className="size-3.5" /> Share passport
                    </Button>
                  )}
                </div>
              </div>
              <AnimatePresence initial={false}>
                {s && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="border-t border-line px-5 py-3 sm:px-6">
                      {s.views.map((v) => (
                        <p key={v.at} className="flex items-center gap-2 text-[14px] text-ink-3">
                          <Eye className="size-3.5" /> Viewed by {v.by} · {dateTime(v.at)}
                        </p>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          )
        })}
      </ul>

      <Dialog.Root open={!!confirming} onOpenChange={(o) => !o && !busy && setConfirming(null)}>
        <AnimatePresence>
          {confirming && passport && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount>
                <motion.div className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount>
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } }}
                  className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-raised p-6 shadow-lift focus:outline-none"
                >
                  <Dialog.Title className="display text-[23px] leading-tight text-ink">Share with {confirming.name}?</Dialog.Title>
                  <Dialog.Description className="mt-1.5 text-[15px] text-ink-2">
                    {confirming.manager}&rsquo;s compliance team will be able to see:
                  </Dialog.Description>
                  <ul className="mt-5 space-y-2.5 text-[15px]">
                    {[
                      'Accredited investor status: verified',
                      `Basis: ${PATHWAY_LABEL[passport.passport.pathway]}`,
                      `Valid through ${shortDate(passport.passport.expiresAt)}`,
                      `Letter reference ${passport.passport.letterRef}`,
                    ].map((t) => (
                      <li key={t} className="flex items-start gap-2.5 text-ink">
                        <Eye className="mt-0.5 size-4 shrink-0 text-ok" /> {t}
                      </li>
                    ))}
                    <li className="flex items-start gap-2.5 text-ink-3">
                      <EyeOff className="mt-0.5 size-4 shrink-0" /> Not your documents, balances, or income
                    </li>
                  </ul>
                  <div className="mt-7 flex justify-end gap-2">
                    <Dialog.Close asChild>
                      <Button variant="ghost" disabled={busy}>
                        Cancel
                      </Button>
                    </Dialog.Close>
                    <Button onClick={() => share(confirming)} loading={busy}>
                      Share passport
                    </Button>
                  </div>
                  <p className="mt-4 text-[12px] text-ink-3">You can revoke access at any time.</p>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </div>
  )
}
