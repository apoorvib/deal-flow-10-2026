import { ArrowLeft, ArrowRight, Check, Lock } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { clearDraft, DraftProvider, STEPS, stepBlocker, toApplication, useDraft, type StepId } from '../features/verify/draft'
import { STEP_CONTENT } from '../features/verify/steps'
import { SubmitOverlay } from '../features/verify/SubmitOverlay'
import { api } from '../lib/api/client'
import { cn } from '../lib/cn'
import { setSession } from '../lib/session'

export default function Verify() {
  return (
    <DraftProvider>
      <Wizard />
    </DraftProvider>
  )
}

function Wizard() {
  const { draft, dispatch } = useDraft()
  const navigate = useNavigate()
  const index = STEPS.findIndex((s) => s.id === draft.step)
  const step = STEPS[index]
  const content = STEP_CONTENT[step.id]
  const [direction, setDirection] = useState(1)
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const blocker = stepBlocker(step.id, draft)
  const [params, setParams] = useSearchParams()

  // Status page deep-links back to a step (e.g. ?step=evidence) to fix an application.
  useEffect(() => {
    const target = params.get('step')
    if (target && STEPS.some((s) => s.id === target)) {
      dispatch({ type: 'goto', step: target as StepId })
      setParams({}, { replace: true })
    }
  }, [params, setParams, dispatch])

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step.id])

  // The furthest step reachable without skipping a blocked one.
  const reachable = (() => {
    let i = 0
    while (i < STEPS.length - 1 && !stepBlocker(STEPS[i].id, draft)) i++
    return i
  })()

  const go = (to: StepId) => {
    const ti = STEPS.findIndex((s) => s.id === to)
    setDirection(ti > index ? 1 : -1)
    setAttempted(false)
    dispatch({ type: 'goto', step: to })
  }

  const next = async () => {
    if (blocker) {
      setAttempted(true)
      return
    }
    if (step.id !== 'review') return go(STEPS[index + 1].id)
    setSubmitting(true)
    try {
      const v = await api.submitVerification(toApplication(draft))
      setSession({ verificationId: v.id, ...(v.passportId ? { passportId: v.passportId } : {}) })
      // Keep the draft when the LP has to fix something; clear it once the case is out of their hands.
      if (v.evaluation.decision === 'approved' || v.evaluation.decision === 'review') {
        clearDraft()
        dispatch({ type: 'reset' })
      }
      navigate(`/status/${v.id}`)
    } catch (e) {
      setSubmitting(false)
      toast.error('Submission failed', { description: e instanceof Error ? e.message : 'Try again in a moment.' })
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-5 pt-8 pb-10 sm:px-8 lg:grid-cols-[240px_1fr] lg:gap-16 lg:pt-14">
      {/* Rail */}
      <aside className="hidden lg:block">
        <div className="sticky top-28">
          <p className="eyebrow">Verification</p>
          <ol className="mt-6 space-y-1">
            {STEPS.map((s, i) => {
              const done = i < index && !stepBlocker(s.id, draft)
              const current = i === index
              const enabled = i <= reachable
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={!enabled}
                    onClick={() => go(s.id)}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-lg py-2 pr-2 text-left text-[14px] transition-colors',
                      current ? 'text-ink' : enabled ? 'text-ink-2 hover:text-ink' : 'text-ink-3/70',
                    )}
                  >
                    <span
                      className={cn(
                        'relative grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[10.5px] transition-colors duration-300',
                        done ? 'border-accent bg-accent text-on-accent' : current ? 'border-ink text-ink' : 'border-line-strong text-ink-3',
                      )}
                    >
                      {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                    </span>
                    <span className={cn(current && 'font-medium')}>{s.title}</span>
                    {current && <motion.span layoutId="rail-dot" className="ml-auto h-4 w-0.5 rounded-full bg-brass" />}
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="mt-10 rounded-xl border border-line bg-surface p-4 text-[12.5px] leading-relaxed text-ink-3">
            <Lock className="mb-2 size-3.5 text-ink-2" />
            Your progress is saved on this device. Documents are encrypted and are never shared with funds.
          </div>
        </div>
      </aside>

      {/* Mobile progress */}
      <div className="lg:hidden">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">
            Step {index + 1} of {STEPS.length}
          </p>
          <p className="text-[13px] text-ink-3">{step.title}</p>
        </div>
        <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-line">
          <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      {/* Step */}
      <section className="min-w-0">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step.id}
            custom={direction}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: 16 * d }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: -10 * d, transition: { duration: 0.16 } }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="max-w-2xl">
              <p className="eyebrow hidden lg:block">
                Step {index + 1} of {STEPS.length}
              </p>
              <h1 ref={headingRef} tabIndex={-1} className="display mt-2 text-[clamp(30px,4.2vw,42px)] leading-[1.06] text-ink outline-none">
                {content.heading(draft)}
              </h1>
              <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">{content.lede(draft)}</p>
            </header>
            <div className="mt-9 max-w-2xl">
              <content.Body />
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="mt-10 max-w-2xl border-t border-line pt-6">
          <AnimatePresence>
            {attempted && blocker && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 text-[13.5px] text-danger"
                role="alert"
              >
                {blocker}
              </motion.p>
            )}
          </AnimatePresence>
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => go(STEPS[Math.max(0, index - 1)].id)} className={cn(index === 0 && 'invisible')}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button size="lg" onClick={next} aria-disabled={!!blocker} className={cn('group min-w-40', blocker && 'opacity-60')}>
              {step.id === 'review' ? 'Submit for verification' : 'Continue'}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Button>
          </div>
        </div>
      </section>

      <SubmitOverlay open={submitting} />
    </div>
  )
}
