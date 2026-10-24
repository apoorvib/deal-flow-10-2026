import { ArrowRight, Check } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChecksList } from '../components/ChecksList'
import { EvidencePanel } from '../components/EvidencePanel'
import { PassportCard } from '../components/PassportCard'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/misc'
import { api, isMock } from '../lib/api/client'
import { homeFor, useAuth } from '../lib/auth'
import { cn } from '../lib/cn'
import { dateTime } from '../lib/format'
import { setSession } from '../lib/session'
import type { Passport, Verification } from '../lib/types'
import { Skeleton, StatusSkeleton } from '../components/ui/skeleton'

export default function Status() {
  const { id = '' } = useParams()
  const [v, setV] = useState<Verification | null>(null)
  const [passport, setPassport] = useState<Passport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { user, refresh } = useAuth()

  useEffect(() => {
    api.getVerification(id).then(setV, (e) => setError(e.message))
  }, [id])

  useEffect(() => {
    if (v?.passportId) api.getPassport(v.passportId).then((r) => setPassport(r.passport))
  }, [v?.passportId])

  // While under review, pick up the result as soon as it lands so the page flips to "verified" by itself.
  const decision = v?.evaluation.decision
  useEffect(() => {
    if (decision !== 'review') return
    const finish = (nv: Verification) => {
      if (nv.evaluation.decision === 'review') return
      if (nv.passportId) {
        setSession({ passportId: nv.passportId })
        refresh()
      }
      setV(nv)
      if (nv.evaluation.decision === 'approved') toast.success('You\u2019re verified', { description: 'Your passport is ready.' })
    }
    // Sandbox has no review queue, so complete the case after a short pause.
    if (isMock) {
      const t = setTimeout(() => api.signOff(id).then(finish), 6000)
      return () => clearTimeout(t)
    }
    const poll = setInterval(() => api.getVerification(id).then(finish, () => {}), 10_000)
    return () => clearInterval(poll)
  }, [decision, id, refresh])

  if (error) return <Missing message={error} />
  if (!v) return <StatusSkeleton />

  const d = v.evaluation.decision

  return (
    <div className="mx-auto max-w-3xl px-5 pt-12 pb-10 sm:px-8 sm:pt-16">
      <AnimatePresence mode="wait">
        <motion.div key={d} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
          {d === 'approved' ? <Approved passport={passport} signedIn={!!user} home={user ? homeFor(user.role) : '/dashboard'} /> : d === 'review' ? <InReview v={v} /> : <NotYet v={v} />}
        </motion.div>
      </AnimatePresence>

      <section className="mt-14">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[16px] font-medium text-ink">Verification checks</h2>
          <span className="font-mono text-[11px] text-ink-3">{v.id}</span>
        </div>
        <ChecksList checks={v.evaluation.checks} className="mt-4" />
      </section>

      <EvidencePanel className="mt-10" checks={v.evaluation.checks} pathway={v.input.pathway} investorType={v.input.investorType} />
    </div>
  )
}

function Approved({ passport, signedIn, home }: { passport: Passport | null; signedIn: boolean; home: string }) {
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
          <Skeleton className="aspect-[1.586/1] rounded-[14px]" />
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
          <Link to={signedIn ? home : '/signin?as=investor&next=/dashboard'} className="link basis-full text-center text-[16px] font-semibold">
            {signedIn ? 'Go to your dashboard' : 'Sign in to track your investments'}
          </Link>
        </div>
      )}
    </div>
  )
}

function InReview({ v }: { v: Verification }) {
  const steps = [
    { label: 'Submitted', at: dateTime(v.createdAt), state: 'done' },
    { label: 'Documents analyzed', at: dateTime(v.createdAt), state: 'done' },
    { label: 'Final checks', at: 'In progress', state: 'current' },
    { label: 'Passport issued', at: 'Next', state: 'todo' },
  ] as const
  return (
    <div>
      <Badge tone="warn" dot>
        Under review
      </Badge>
      <h1 className="display mt-5 text-[clamp(32px,4.6vw,46px)] leading-[1.04] text-ink">Under review</h1>
      <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-2">Almost done, usually within a few hours. You don&rsquo;t need to do anything. This page updates, and we&rsquo;ll email you, the moment your passport is ready.</p>

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
