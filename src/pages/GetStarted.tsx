import { ArrowRight, BadgeCheck, Building2, FileCheck2, Fingerprint, User, UserRound, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { Photo } from '../components/Photo'
import type { PhotoKey } from '../lib/photos'
import type { InvestorType } from '../lib/types'

const TYPES: { id: InvestorType; label: string; icon: typeof User }[] = [
  { id: 'individual', label: 'Just me', icon: User },
  { id: 'joint', label: 'Me and my spouse', icon: Users },
  { id: 'entity', label: 'An entity or trust', icon: Building2 },
]

const PROCESS = [
  { icon: UserRound, label: 'Details' },
  { icon: Fingerprint, label: 'Scan ID' },
  { icon: FileCheck2, label: 'Qualify' },
  { icon: BadgeCheck, label: 'Get passport' },
]

export default function GetStarted() {
  return (
    <div className="mx-auto max-w-[760px] px-5 pt-14 pb-6 text-center sm:px-8 sm:pt-20">
      <h1 className="display text-[clamp(34px,5vw,52px)] leading-[1.08] text-ink">Verify your status privately</h1>
      <p className="mt-3 text-[18px] text-ink-2">About 10 minutes. Your tax returns never go to a fund manager&rsquo;s inbox.</p>

      {/* Where this ends up */}
      <div className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-3">
        {(['img05', 'img18', 'img15'] as PhotoKey[]).map((k, i) => (
          <motion.div key={k} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i }} className="aspect-[4/5] overflow-hidden rounded-[6px]">
            <Photo name={k} sizes="(min-width: 768px) 220px, 33vw" className="size-full" />
          </motion.div>
        ))}
      </div>

      {/* The process at a glance */}
      <ol className="mx-auto mt-10 flex max-w-xl items-start justify-between">
        {PROCESS.map((s, i) => (
          <motion.li key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="relative flex flex-1 flex-col items-center gap-2.5">
            {i < PROCESS.length - 1 && <span className="absolute top-6 left-[calc(50%+28px)] h-px w-[calc(100%-56px)] bg-line-strong/50" aria-hidden />}
            <span className="grid size-12 place-items-center rounded-full bg-accent/[0.08] text-accent">
              <s.icon className="size-5" strokeWidth={1.75} />
            </span>
            <span className="text-[15px] text-ink-2">{s.label}</span>
          </motion.li>
        ))}
      </ol>

      <h2 className="mt-16 text-[22px] font-semibold text-ink">Who&rsquo;s investing?</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {TYPES.map((t, i) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + 0.05 * i }}>
            <Link
              to={`/verify?type=${t.id}`}
              className="group flex h-full flex-col items-center gap-3 rounded-[6px] border border-line-strong/60 bg-raised px-4 py-7 transition-[border-color,box-shadow] hover:border-accent hover:shadow-[0_0_0_1px_var(--accent)]"
            >
              <t.icon className="size-7 text-accent" strokeWidth={1.5} />
              <span className="text-[17px] font-semibold text-ink">{t.label}</span>
              <ArrowRight className="size-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          </motion.div>
        ))}
      </div>

      <p className="mt-8 text-[15px] text-ink-3">Have your ID and bank login handy · Saves as you go</p>
      <p className="mt-3 text-[15px] text-ink-3">
        Already verified?{' '}
        <Link to="/find" className="link font-semibold">
          Open your passport
        </Link>
      </p>
    </div>
  )
}
