import { ArrowRight, Eye, EyeOff, FileCheck2, Fingerprint, Send } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { PassportCard } from '../components/PassportCard'
import { Button } from '../components/ui/button'
import { PATHWAYS } from '../lib/rules'

const reveal = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.08 * i, duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } }),
}

const today = new Date()
const specimen = {
  holderName: 'Eleanor M. Whitaker',
  investorType: 'individual' as const,
  pathway: 'net_worth' as const,
  letterRef: `AIV-${today.getFullYear()}-7Q2K4D`,
  issuedAt: today.toISOString(),
  expiresAt: new Date(today.getTime() + 90 * 86_400_000).toISOString(),
  status: 'specimen' as const,
}

export default function Landing() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      {/* Hero */}
      <section className="grid items-center gap-12 pt-14 pb-20 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-24 lg:pb-28">
        <motion.div initial="hidden" animate="show">
          <motion.p custom={0} variants={reveal} className="eyebrow">
            For limited partners
          </motion.p>
          <motion.h1 custom={1} variants={reveal} className="display mt-5 text-[clamp(44px,7vw,76px)] leading-[0.98] font-[450] text-ink">
            Verify once.
            <br />
            <span className="text-ink-2 italic">Invest anywhere.</span>
          </motion.h1>
          <motion.p custom={2} variants={reveal} className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-ink-2">
            A reusable accredited investor passport. Prove your status in about ten minutes, then share it with any fund, syndicate, or SPV in one click. No more emailing tax returns to every GP.
          </motion.p>
          <motion.div custom={3} variants={reveal} className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link to="/verify">
              <Button size="lg" className="group">
                Start verification
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <a href="#how" className="text-sm text-ink-2 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink">
              How it works
            </a>
          </motion.div>
          <motion.dl custom={4} variants={reveal} className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-line pt-6">
            {[
              ['~10 min', 'to apply'],
              ['90 days', 'per passport'],
              ['0', 'documents sent to funds'],
            ].map(([k, v]) => (
              <div key={v}>
                <dt className="display text-2xl text-ink">{k}</dt>
                <dd className="mt-1 text-[12.5px] leading-snug text-ink-3">{v}</dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24, rotate: -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ delay: 0.25, duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto w-full max-w-[520px]"
        >
          {/* A second card peeking behind, so the passport reads as a physical object in a stack. */}
          <div className="relative">
            <div className="absolute inset-x-5 -bottom-2.5 h-full rounded-[22px] border border-line bg-surface shadow-card" aria-hidden />
            <PassportCard data={specimen} />
          </div>
          <p className="mt-6 text-center font-mono text-[11px] tracking-[0.14em] text-ink-3 uppercase">Specimen · move your cursor over the card</p>
        </motion.div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 border-t border-line py-20">
        <SectionHead eyebrow="How it works" title="Three steps, one time." />
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
          {[
            { icon: Fingerprint, title: 'Confirm who you are', body: 'Scan a government ID. We run sanctions and politically exposed person (PEP) screening at the same time.' },
            { icon: FileCheck2, title: 'Show how you qualify', body: 'Link accounts, upload tax documents, or enter your license. AI reads the documents; an attorney signs every letter.' },
            { icon: Send, title: 'Share your passport', body: 'Send your verified status to any participating fund. Reuse it for 90 days, then refresh in minutes.' },
          ].map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ delay: i * 0.08 }}
              className="flex flex-col bg-surface p-7 sm:p-8"
            >
              <div className="flex items-center justify-between">
                <span className="display text-[40px] leading-none text-line-strong">0{i + 1}</span>
                <s.icon className="size-5 text-brass" strokeWidth={1.6} />
              </div>
              <h3 className="mt-10 text-[17px] font-medium text-ink">{s.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Privacy split */}
      <section className="border-t border-line py-20">
        <SectionHead eyebrow="Privacy" title="Funds see the verdict, not your finances." />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <PrivacyCol
            icon={<Eye className="size-4" />}
            title="What a fund sees"
            items={['Verified accredited status', 'Which test you passed (e.g. net worth)', 'Issue and expiry dates', 'The attorney-signed letter reference']}
            tone="ok"
          />
          <PrivacyCol
            icon={<EyeOff className="size-4" />}
            title="What stays with us"
            items={['Tax returns, W-2s, and K-1s', 'Account balances and statements', 'Your ID document and photo', 'Exact income and net worth figures']}
            tone="neutral"
          />
        </div>
      </section>

      {/* Pathways */}
      <section className="border-t border-line py-20">
        <SectionHead eyebrow="Ways to qualify" title="Pick the path that fits you." />
        <ul className="mt-10 divide-y divide-line border-y border-line">
          {PATHWAYS.map((p) => (
            <li key={p.id} className="grid gap-2 py-5 sm:grid-cols-[220px_1fr_auto] sm:items-baseline sm:gap-8">
              <span className="display text-xl text-ink">{p.title}</span>
              <span className="text-[14.5px] leading-relaxed text-ink-2">{p.requirement(p.allowed('individual') ? 'individual' : 'entity')}</span>
              <span className="font-mono text-xs text-ink-3">{p.time}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Closing CTA */}
      <section className="py-20">
        <div className="relative overflow-hidden rounded-3xl bg-[#16302a] px-7 py-14 text-[#efe9dc] sm:px-14">
          <div className="absolute inset-0 bg-[radial-gradient(80%_120%_at_100%_0%,#24473c_0%,transparent_60%)]" aria-hidden />
          <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-end">
            <div>
              <p className="font-mono text-[11px] tracking-[0.18em] text-[#d8c39a]/80 uppercase">Ready when you are</p>
              <h2 className="display mt-4 max-w-lg text-[clamp(30px,4.4vw,44px)] leading-[1.05]">Your next allocation shouldn&rsquo;t start with paperwork.</h2>
            </div>
            <Link to="/verify">
              <Button size="lg" className="bg-[#efe9dc] text-[#16302a] hover:bg-white">
                Start verification <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="display mt-3 text-[clamp(28px,4vw,40px)] leading-[1.08] text-ink">{title}</h2>
    </div>
  )
}

function PrivacyCol({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: 'ok' | 'neutral' }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-7">
      <div className="flex items-center gap-2.5">
        <span className={tone === 'ok' ? 'grid size-7 place-items-center rounded-full bg-ok-soft text-ok' : 'grid size-7 place-items-center rounded-full bg-ink/5 text-ink-2'}>{icon}</span>
        <h3 className="text-[15px] font-medium text-ink">{title}</h3>
      </div>
      <ul className="mt-5 space-y-3">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-3 text-[14.5px] text-ink-2">
            <span className={tone === 'ok' ? 'mt-2 size-1.5 shrink-0 rounded-full bg-ok' : 'mt-2 size-1.5 shrink-0 rounded-full bg-ink-3/50'} />
            {it}
          </li>
        ))}
      </ul>
    </div>
  )
}
