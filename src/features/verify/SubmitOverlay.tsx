import { Check, Loader2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import mark from '../../assets/savy-mark.png'

const STAGES = ['Confirming identity and sanctions screen', 'Reconciling your documents', 'Applying Rule 501(a) tests', 'Preparing your verification file']

/** Shown while the application is evaluated. Stages pace themselves; the request decides when it closes. */
export function SubmitOverlay({ open }: { open: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-paper/92 px-6 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="w-full max-w-sm">
            <motion.img src={mark} alt="" className="mx-auto h-16 w-auto" animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
            <h2 className="display mt-6 text-center text-[26px] text-ink">Reviewing your application</h2>
            <Stages />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Stages() {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 650)
    return () => clearInterval(t)
  }, [])
  return (
    <ul className="mt-8 space-y-3.5">
      {STAGES.map((s, i) => (
        <li key={s} className="flex items-center gap-3 text-[15px]">
          <span className="grid size-5 place-items-center">
            {i < stage ? (
              <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid size-5 place-items-center rounded-full bg-accent text-on-accent">
                <Check className="size-3" strokeWidth={3} />
              </motion.span>
            ) : i === stage ? (
              <Loader2 className="size-4 animate-spin text-ink-2" />
            ) : (
              <span className="size-1.5 rounded-full bg-line-strong" />
            )}
          </span>
          <span className={i <= stage ? 'text-ink' : 'text-ink-3'}>{s}</span>
        </li>
      ))}
    </ul>
  )
}
