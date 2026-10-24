import { ArrowRight, CircleCheck, Loader2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PassportCard } from '../components/PassportCard'
import { Button } from '../components/ui/button'
import { api } from '../lib/api/client'
import { useAuth } from '../lib/auth'
import { setSession } from '../lib/session'
import type { Fund, Passport } from '../lib/types'

type State =
  | { kind: 'opening' }
  | { kind: 'confirm'; fund: Fund; passport: Passport }
  | { kind: 'cleared'; fund: Fund; passport: Passport }
  | { kind: 'error'; message: string }

/**
 * Where a fund's invite email lands. The link signs the LP in (or creates their account), then:
 * already verified -> their passport goes to the fund and we say so; otherwise -> onboarding, tied to the invite.
 */
export default function InviteLanding() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [state, setState] = useState<State>({ kind: 'opening' })
  const [fundName, setFundName] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      try {
        const view = await api.getInvite(token)
        setFundName(view.fund.name)
        const res = await api.acceptInvite(token)
        await refresh()
        if ((res.outcome === 'shared' || res.outcome === 'confirm') && res.passportId) {
          setSession({ passportId: res.passportId, invite: null })
          const { passport } = await api.getPassport(res.passportId)
          setState({ kind: res.outcome === 'shared' ? 'cleared' : 'confirm', fund: res.fund, passport })
        } else {
          setSession({ invite: { token, fundName: res.fund.name, email: view.email } })
          navigate('/get-started?invited=1', { replace: true })
        }
      } catch (e) {
        setState({ kind: 'error', message: e instanceof Error ? e.message : 'This invitation link isn’t valid.' })
      }
    })()
  }, [token, navigate, refresh])

  if (state.kind === 'error') {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="display text-3xl text-ink">Invitation not found</h1>
        <p className="mt-3 text-ink-2">The link may have expired. Ask the fund to send a new one, or verify on your own.</p>
        <Link to="/get-started" className="mt-6 inline-block">
          <Button>Get verified</Button>
        </Link>
      </div>
    )
  }

  if (state.kind === 'opening') {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-5 text-center">
        <div>
          <Loader2 className="mx-auto size-7 animate-spin text-accent" />
          <p className="mt-4 text-[17px] text-ink-2">{fundName ? `Opening your invitation from ${fundName}…` : 'Opening your invitation…'}</p>
        </div>
      </div>
    )
  }

  if (state.kind === 'confirm') {
    const { fund, passport } = state
    return (
      <div className="mx-auto max-w-3xl px-5 pt-14 pb-10 text-center sm:px-8 sm:pt-20">
        <h1 className="display text-[clamp(32px,4.6vw,48px)] leading-[1.06] text-ink">Share your passport with {fund.name}?</h1>
        <p className="mx-auto mt-4 max-w-lg text-[17px] leading-relaxed text-ink-2">You&rsquo;re already verified. {fund.manager} will see your status, basis and dates, never your documents.</p>
        <div className="mx-auto mt-10 max-w-md">
          <PassportCard data={{ ...passport, status: 'active' }} />
        </div>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => api.sharePassport(passport.id, fund.id).then(() => setState({ kind: 'cleared', fund, passport }))}>
            Share passport
          </Button>
          <Link to="/dashboard">
            <Button size="lg" variant="secondary">
              Not now
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-14 pb-10 text-center sm:px-8 sm:pt-20">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-3 py-1 text-[14px] font-semibold text-ok">
        <CircleCheck className="size-4" /> Already verified
      </span>
      <h1 className="display mt-5 text-[clamp(32px,4.6vw,48px)] leading-[1.06] text-ink">You&rsquo;re cleared for {state.fund.name}.</h1>
      <p className="mx-auto mt-4 max-w-lg text-[17px] leading-relaxed text-ink-2">
        Your passport was still valid, so we shared it with {state.fund.manager}. Nothing else to do. They see your status, never your documents.
      </p>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} className="mx-auto mt-10 max-w-md">
        <PassportCard data={{ ...state.passport, status: 'active' }} />
      </motion.div>
      <Link to="/dashboard" className="mt-9 inline-block">
        <Button size="lg">
          Go to my dashboard <ArrowRight className="size-4" />
        </Button>
      </Link>
    </div>
  )
}
