import { Briefcase, ChevronDown, Globe, LayoutGrid, ShieldUser, User } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/cn'
import type { AdminView } from '../lib/types'

const VIEWS: { id: AdminView; label: string; icon: typeof User }[] = [
  { id: 'admin', label: 'Console', icon: LayoutGrid },
  { id: 'investor', label: 'Investor', icon: User },
  { id: 'issuer', label: 'Fund', icon: Briefcase },
  { id: 'visitor', label: 'Visitor', icon: Globe },
]

/** Floating view switcher, shown on every page while an admin is signed in. */
export function AdminBar() {
  const { admin, switchTo } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(true)
  const [busy, setBusy] = useState<AdminView | null>(null)
  if (!admin) return null

  const go = async (as: AdminView) => {
    setBusy(as)
    try {
      navigate(await switchTo(as))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] z-40 flex justify-center px-4">
      <motion.div layout className="pointer-events-auto flex items-center gap-1 rounded-full bg-ink p-1.5 text-white shadow-lift">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold tracking-wide text-white/70 uppercase hover:text-white" aria-expanded={open}>
          <ShieldUser className="size-4" /> Demo
          <ChevronDown className={cn('size-3.5 transition-transform', open ? '-rotate-90' : 'rotate-90')} />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 'auto', opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="flex items-center gap-1 overflow-hidden">
              {VIEWS.map((v) => {
                const on = admin.viewingAs === v.id
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => go(v.id)}
                    aria-pressed={on}
                    className={cn('relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] whitespace-nowrap transition-colors', on ? 'text-ink' : 'text-white/80 hover:text-white', busy === v.id && 'opacity-60')}
                  >
                    {on && <motion.span layoutId="admin-pill" className="absolute inset-0 rounded-full bg-white" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                    <v.icon className="relative size-4" />
                    <span className="relative">{v.label}</span>
                  </button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
