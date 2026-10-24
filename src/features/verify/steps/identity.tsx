import { AlertTriangle, Camera, RotateCcw, ShieldCheck } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/misc'
import { api, isMock, type KycScenario } from '../../../lib/api/client'
import { cn } from '../../../lib/cn'
import { useDraft } from '../draft'
import { SandboxPicker } from './sandbox'

export function IdentityStep() {
  const { draft, dispatch } = useDraft()
  const [busy, setBusy] = useState(false)
  const [scenario, setScenario] = useState<KycScenario>('clean')
  const kyc = draft.kyc

  const run = async () => {
    setBusy(true)
    try {
      const s = await api.startKyc(draft.profile.legalName, scenario)
      dispatch({ type: 'patch', patch: { kyc: s } })
    } finally {
      setBusy(false)
    }
  }

  const state = busy ? 'scanning' : kyc?.status === 'verified' ? 'verified' : kyc?.status === 'failed' ? 'failed' : 'idle'

  return (
    <div className="grid gap-5">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid place-items-center px-6 pt-10 pb-8">
          <IdGraphic state={state} />
        </div>
        <div className="border-t border-line bg-raised px-5 py-4 sm:px-6">
          <AnimatePresence mode="wait" initial={false}>
            {state === 'verified' && kyc ? (
              <motion.div key="ok" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="size-5 text-ok" />
                  <div>
                    <p className="text-[14.5px] font-medium text-ink">ID verified for {kyc.nameOnId}</p>
                    <p className="text-[13px] text-ink-3">Liveness check passed</p>
                  </div>
                </div>
                {kyc.ofacHit ? <Badge tone="warn" dot>Sanctions: needs review</Badge> : <Badge tone="ok" dot>Sanctions and PEP: clear</Badge>}
              </motion.div>
            ) : state === 'failed' ? (
              <motion.div key="fail" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="size-5 text-danger" />
                  <div>
                    <p className="text-[14.5px] font-medium text-ink">We couldn&rsquo;t read your ID</p>
                    <p className="text-[13px] text-ink-3">Try again in good light, with all four corners in frame.</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={run}>
                  <RotateCcw className="size-3.5" /> Try again
                </Button>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-sm text-[13.5px] leading-relaxed text-ink-2">
                  {busy ? 'Checking the document and matching your selfie…' : 'Have a passport or driver’s license ready. It takes under a minute on your phone or webcam.'}
                </p>
                <Button onClick={run} loading={busy}>
                  {!busy && <Camera className="size-4" />}
                  {busy ? 'Verifying' : 'Verify my ID'}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {isMock && !kyc && (
        <SandboxPicker
          value={scenario}
          onChange={setScenario}
          options={[
            { id: 'clean', label: 'Clean' },
            { id: 'ofac', label: 'OFAC hit' },
            { id: 'fail', label: 'ID fails' },
          ]}
        />
      )}
      {kyc && (
        <button type="button" className="justify-self-start text-[13px] text-ink-3 underline decoration-line-strong underline-offset-4 hover:text-ink" onClick={() => dispatch({ type: 'patch', patch: { kyc: null } })}>
          Use a different ID
        </button>
      )}
    </div>
  )
}

function IdGraphic({ state }: { state: 'idle' | 'scanning' | 'verified' | 'failed' }) {
  return (
    <div className="relative aspect-[1.586/1] w-full max-w-[320px]">
      {/* Corner brackets */}
      {['top-0 left-0 border-t-2 border-l-2 rounded-tl-xl', 'top-0 right-0 border-t-2 border-r-2 rounded-tr-xl', 'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl', 'bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl'].map((c) => (
        <motion.span
          key={c}
          className={cn('absolute size-6', c, state === 'verified' ? 'border-ok' : state === 'failed' ? 'border-danger' : 'border-ink-3')}
          animate={state === 'scanning' ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
          transition={state === 'scanning' ? { duration: 1.4, repeat: Infinity } : undefined}
        />
      ))}
      <div className="absolute inset-3 overflow-hidden rounded-lg border border-line-strong bg-raised">
        <div className="flex h-full gap-[7%] p-[7%]">
          <div className="aspect-[3/4] h-[78%] rounded-md bg-line" />
          <div className="flex flex-1 flex-col gap-[9%] pt-[2%]">
            <div className="h-2 w-[70%] rounded-full bg-line-strong" />
            <div className="h-2 w-[90%] rounded-full bg-line" />
            <div className="h-2 w-[55%] rounded-full bg-line" />
            <div className="mt-auto h-2 w-[80%] rounded-full bg-line" />
          </div>
        </div>
        {state === 'scanning' && (
          <motion.div
            className="absolute inset-x-0 h-14 bg-[linear-gradient(to_bottom,transparent,color-mix(in_oklab,var(--accent)_22%,transparent),transparent)]"
            initial={{ top: '-30%' }}
            animate={{ top: ['-30%', '100%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <AnimatePresence>
          {state === 'verified' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center bg-ok-soft/70 backdrop-blur-[1px]">
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 22 }} className="grid size-12 place-items-center rounded-full bg-ok text-white shadow-lg">
                <ShieldCheck className="size-6" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
