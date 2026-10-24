import { ArrowLeft, ArrowRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { clearDraft, DraftProvider, minutesLeft, STEPS, stepBlocker, toApplication, useDraft, type StepId } from '../features/verify/draft'
import { STEP_CONTENT } from '../features/verify/steps'
import { SubmitOverlay } from '../features/verify/SubmitOverlay'
import { api } from '../lib/api/client'
import { useAuth } from '../lib/auth'
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
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const index = STEPS.findIndex((s) => s.id === draft.step)
  const step = STEPS[index]
  const content = STEP_CONTENT[step.id]
  const last = index === STEPS.length - 1
  const [direction, setDirection] = useState(1)
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const blocker = stepBlocker(step.id, draft)
  const [params, setParams] = useSearchParams()

  // ?type= comes from the process page (preselects who's investing); ?step= from the status page (fix something).
  useEffect(() => {
    const target = params.get('step')
    const investorType = params.get('type')
    if (investorType === 'individual' || investorType === 'joint' || investorType === 'entity') {
      dispatch({ type: 'patch', patch: { investorType } })
    }
    if (target && STEPS.some((s) => s.id === target)) dispatch({ type: 'goto', step: target as StepId })
    if (target || investorType) setParams({}, { replace: true })
  }, [params, setParams, dispatch])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // Land on the first field so the LP can just start typing; otherwise announce the step heading.
    const first = document.querySelector<HTMLInputElement>('[data-step-body] input:not([type=checkbox]):not([type=radio]):not([type=file])')
    if (first && !first.value) first.focus({ preventScroll: true })
    else headingRef.current?.focus({ preventScroll: true })
  }, [step.id])

  const go = (to: StepId) => {
    setDirection(STEPS.findIndex((s) => s.id === to) > index ? 1 : -1)
    setAttempted(false)
    dispatch({ type: 'goto', step: to })
  }

  const next = async (e?: FormEvent) => {
    e?.preventDefault()
    if (blocker) return setAttempted(true)
    if (!last) return go(STEPS[index + 1].id)
    setSubmitting(true)
    try {
      const v = await api.submitVerification(toApplication(draft))
      setSession({ verificationId: v.id, ...(v.passportId ? { passportId: v.passportId } : {}) })
      if (v.passportId) refresh()
      // Keep the draft when the LP has to fix something; clear it once the case is out of their hands.
      if (v.evaluation.decision === 'approved' || v.evaluation.decision === 'review') {
        clearDraft()
        dispatch({ type: 'reset' })
      }
      navigate(`/status/${v.id}`)
    } catch (err) {
      setSubmitting(false)
      toast.error('Submission failed', { description: err instanceof Error ? err.message : 'Try again in a moment.' })
    }
  }

  return (
    <div className="mx-auto max-w-[640px] px-5 pt-8 pb-10 sm:px-8 sm:pt-12">
      {/* Progress */}
      <div className="flex items-baseline justify-between text-[15px]">
        <span className="font-semibold text-ink">
          Step {index + 1} of {STEPS.length}
        </span>
        <span className="text-ink-3">About {minutesLeft(step.id)} min left</span>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5" aria-hidden>
        {STEPS.map((s, i) => (
          <div key={s.id} className="h-1 overflow-hidden rounded-full bg-line">
            <motion.div className="h-full bg-accent" initial={false} animate={{ width: i <= index ? '100%' : '0%' }} transition={{ duration: 0.4 }} />
          </div>
        ))}
      </div>

      <form onSubmit={next} noValidate>
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step.id}
            custom={direction}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: 16 * d }),
              center: { opacity: 1, x: 0 },
              exit: (d: number) => ({ opacity: 0, x: -10 * d, transition: { duration: 0.14 } }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 ref={headingRef} tabIndex={-1} className="display mt-10 text-[clamp(30px,4.4vw,40px)] leading-[1.1] text-ink outline-none">
              {content.heading(draft)}
            </h1>
            <div data-step-body className="mt-8">
              <content.Body onDone={() => !stepBlocker(step.id, draft) && next()} />
            </div>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {attempted && blocker && (
            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-6 text-[15px] text-danger" role="alert">
              {blocker}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => go(STEPS[Math.max(0, index - 1)].id)} className={cn('px-2', index === 0 && 'invisible')}>
            <ArrowLeft className="size-4" /> Back
          </Button>
          <Button type="submit" size="lg" className={cn('group min-w-40', blocker && 'opacity-60')}>
            {last ? 'Submit' : 'Continue'}
            {!last && <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />}
          </Button>
        </div>
      </form>

      <SubmitOverlay open={submitting} />
    </div>
  )
}
