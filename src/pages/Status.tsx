import { ArrowRight, Check, FlaskConical } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChecksList } from '../components/ChecksList'
import { PassportCard } from '../components/PassportCard'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/misc'
import { api, isMock } from '../lib/api/client'
import { cn } from '../lib/cn'
import { dateTime } from '../lib/format'
import { setSession } from '../lib/session'
import type { Passport, Verification } from '../lib/types'
import { PageSkeleton } from './PassportPage'

export default function Status() {
  const { id = '' } = useParams()
  const [v, setV] = useState<Verification | null>(null)
  const [passport, setPassport] = useState<Passport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)

  useEffect(() => {
    api.getVerification(id).then(setV, (e) => setError(e.message))
  }, [id])

  useEffect(() => {
    if (v?.passportId) api.getPassport(v.passportId).then((r) => setPassport(r.passport))
  }, [v?.passportId])

  if (error) return <Missing message={error} />
  if (!v) return <PageSkeleton />

  const signOff = async () => {
    setSigning(true)
    try {
      const nv = await api.signOff(v.id)
      setSession({ passportId: nv.passportId })
      setV(nv)
      toast.success('Letter signed', { description: 'Your passport has been issued.' })
    } finally {
      setSigning(false)
    }
  }

  const d = v.evaluation.decision

  return (
    <div className="mx-auto max-w-3xl px-5 pt-12 pb-10 sm:px-8 sm:pt-16">
      <AnimatePresence mode="wait">
        <motion.div key={d} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
          {d === 'approved' ? <Approved passport={passport} /> : d === 'review' ? <InReview v={v} onSignOff={signOff} signing={signing} /> : <NotYet v={v} />}
        </motion.div>
      </AnimatePresence>

      <section className="mt-14">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[16px] font-medium text-ink">Verification checks</h2>
          <span className="font-mono text-[11px] text-ink-3">{v.id}</span>
        </div>
        <ChecksList checks={v.evaluation.checks} className="mt-4" />
      </section>
    </div>
  )
}

function Approved({ passport }: { passport: Passport | null }) {
  return (
    <div className="text-center">
      <Badge tone="ok" dot>
        Verified
      </Badge>
      <h1 className="display mt-5 text-[clamp(34px,5vw,52px)] leading-[1.02] text-ink">You&rsquo;re verified.</h1>
      <p className="mx-auto mt-4 max-w-md text-[17px] leading-relaxed text-ink-2">Share your passport with any Savy fund for 90 days. They see your status, never your documents.</p>
      <div className="mx-auto mt-10 max-w-md">
        {passport ? (
          <motion.div initial={{ opacity: 0, y: 30, rotateX: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} style={{ transformPerspective: 1200 }}>
            <PassportCard data={{ ...passport, status: 'active' }} />
          </motion.div>
        ) : (
          <div className="aspect-[1.586/1] animate-pulse rounded-[14px] bg-line" />
        )}
      </div>
      {passport && (
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link to={`/passport/${passport.id}`}>
            <Button size="lg">
              Open passport <ArrowRight className="size-4" />
            </Button>
          </Link>
          <Link to={`/passport/${passport.id}/deals`}>
            <Button size="lg" variant="secondary">
              Share with a fund
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}

function InReview({ v, onSignOff, signing }: { v: Verification; onSignOff: () => void; signing: boolean }) {
  const steps = [
    { label: 'Application submitted', at: dateTime(v.createdAt), state: 'done' },
    { label: 'Automated checks complete', at: dateTime(v.createdAt), state: 'done' },
    { label: 'Attorney review', at: 'In progress', state: 'current' },
    { label: 'Letter signed and passport issued', at: 'Next', state: 'todo' },
  ] as const
  return (
    <div>
      <Badge tone="warn" dot>
        In review
      </Badge>
      <h1 className="display mt-5 text-[clamp(32px,4.6vw,46px)] leading-[1.04] text-ink">With an attorney for review.</h1>
      <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-2">Most of your application passed automatically. A licensed attorney is confirming the items below. We&rsquo;ll email you when your passport is issued, usually within one business day.</p>

      <ol className="mt-10">
        {steps.map((s, i) => (
          <li key={s.label} className="relative grid grid-cols-[28px_1fr] gap-4 pb-7 last:pb-0">
            {i < steps.length - 1 && <span className={cn('absolute top-7 bottom-0 left-[13.5px] w-px', s.state === 'done' ? 'bg-accent' : 'bg-line-strong')} />}
            <span
              className={cn(
                'relative grid size-7 place-items-center rounded-full border',
                s.state === 'done' ? 'border-accent bg-accent text-on-accent' : s.state === 'current' ? 'border-warn bg-warn-soft' : 'border-line-strong bg-raised',
              )}
            >
              {s.state === 'done' && <Check className="size-3.5" strokeWidth={3} />}
              {s.state === 'current' && (
                <>
                  <span className="size-2 rounded-full bg-warn" />
                  <motion.span className="absolute inset-0 rounded-full border border-warn" animate={{ scale: [1, 1.6], opacity: [0.6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }} />
                </>
              )}
            </span>
            <div className="pt-0.5">
              <p className={cn('text-[16px]', s.state === 'todo' ? 'text-ink-3' : 'text-ink')}>{s.label}</p>
              <p className="text-[14px] text-ink-3">{s.at}</p>
            </div>
          </li>
        ))}
      </ol>

      {v.evaluation.reasons.length > 0 && (
        <div className="mt-10 rounded-2xl border border-warn/30 bg-warn-soft/60 p-5">
          <p className="text-[14px] font-medium text-warn">What the reviewer is checking</p>
          <ul className="mt-2.5 space-y-1.5">
            {v.evaluation.reasons.map((r) => (
              <li key={r} className="text-[15px] text-ink-2">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isMock && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3">
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.14em] text-ink-3 uppercase">
            <FlaskConical className="size-3.5" /> Sandbox
          </span>
          <Button size="sm" variant="secondary" onClick={onSignOff} loading={signing}>
            Simulate attorney sign-off
          </Button>
        </div>
      )}
    </div>
  )
}

function NotYet({ v }: { v: Verification }) {
  const navigate = useNavigate()
  const denied = v.evaluation.decision === 'denied'
  return (
    <div>
      <Badge tone={denied ? 'danger' : 'brass'} dot>
        {denied ? 'Not verified' : 'Action needed'}
      </Badge>
      <h1 className="display mt-5 text-[clamp(32px,4.6vw,46px)] leading-[1.04] text-ink">{denied ? 'We couldn’t verify you this way.' : 'Almost there. A few things are missing.'}</h1>
      <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-2">
        {denied ? 'Based on what you provided, this test isn’t met. You may still qualify another way, for example through net worth or a minimum investment.' : 'Your progress is saved. Fix the items below and resubmit; it only takes a minute.'}
      </p>
      <ul className="mt-8 space-y-2">
        {v.evaluation.reasons.map((r) => (
          <li key={r} className="flex items-start gap-3 rounded-xl border border-line bg-raised px-4 py-3.5 text-[15px] text-ink">
            <span className={cn('mt-2 size-1.5 shrink-0 rounded-full', denied ? 'bg-danger' : 'bg-brass')} />
            {r}
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button size="lg" onClick={() => navigate('/verify?step=qualify')}>
          {denied ? 'Try another way to qualify' : 'Update my application'} <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function Missing({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="display text-3xl text-ink">Not found</h1>
      <p className="mt-3 text-ink-2">{message}</p>
      <Link to="/verify" className="mt-6 inline-block">
        <Button>Start verification</Button>
      </Link>
    </div>
  )
}
