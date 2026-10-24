import { CircleAlert, CircleCheck, CircleX } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '../lib/cn'
import type { Check } from '../lib/types'

const ICON = {
  pass: <CircleCheck className="size-4 text-ok" />,
  warn: <CircleAlert className="size-4 text-warn" />,
  fail: <CircleX className="size-4 text-danger" />,
}

export function ChecksList({ checks, className }: { checks: Check[]; className?: string }) {
  return (
    <ul className={cn('divide-y divide-line overflow-hidden rounded-2xl border border-line bg-raised', className)}>
      {checks.map((c, i) => (
        <motion.li
          key={c.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 * i }}
          className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-5 py-3.5"
        >
          <span className="mt-0.5">{ICON[c.result]}</span>
          <span className="text-[15px] text-ink">{c.label}</span>
          <span className="col-start-2 text-[14px] leading-relaxed text-ink-3">{c.detail}</span>
        </motion.li>
      ))}
    </ul>
  )
}
