import { ArrowRight, Briefcase, Building2, ChevronDown, ChevronRight, Clock, Eye, EyeOff, FileCheck2, Fingerprint, Lock, RefreshCw, Send, User, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { PassportCard } from '../components/PassportCard'
import { Button } from '../components/ui/button'
import { PATHWAYS } from '../lib/rules'

// Unsplash License: free for commercial use, no attribution required.
const HERO_IMAGE = 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=2400&q=80&auto=format&fit=crop'

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

const AUDIENCES = [
  { icon: User, label: 'Individuals', to: '/get-started?type=individual' },
  { icon: Users, label: 'Couples', to: '/get-started?type=joint' },
  { icon: Building2, label: 'Entities & trusts', to: '/get-started?type=entity' },
  { icon: Briefcase, label: 'Fund managers', to: '/#funds' },
]

const STATS = [
  { k: '~10 min', v: 'to apply, start to finish' },
  { k: '90 days', v: 'that each passport stays valid' },
  { k: '1 click', v: 'to share with a new fund' },
  { k: '0', v: 'documents ever sent to funds' },
]

const FAQ = [
  { q: 'Who needs to be accredited?', a: 'Funds raising under SEC Rule 506(c) must take reasonable steps to verify every investor. If a fund asks you for accreditation, a Savy passport covers it.' },
  { q: 'Does this affect my credit score?', a: 'No. We don\u2019t run a credit check. We confirm balances you link or documents you upload, and you report liabilities yourself.' },
  { q: 'What do funds see?', a: 'Your verified status, which test you passed, the dates, and the attorney-signed letter reference. Never your documents, balances, or income.' },
  { q: 'How long does a passport last?', a: 'Ninety days, the window funds rely on under SEC guidance. Refreshing takes a few minutes because your profile is already on file.' },
  { q: 'What if my situation is complicated?', a: 'Trusts, entities, and joint filings go to a licensed attorney for a quick review, usually within one business day.' },
]

const inView = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
}

export default function Landing() {
  return (
    <>
      {/* Hero: full-bleed photo, white offer card */}
      <section className="relative isolate overflow-hidden">
        <img src={HERO_IMAGE} alt="" className="absolute inset-0 -z-10 size-full object-cover object-[65%_center]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/15 to-transparent" aria-hidden />
        <div className="mx-auto flex min-h-[560px] max-w-6xl items-center px-5 py-16 sm:px-8 lg:min-h-[640px]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[600px] bg-raised/95 p-8 shadow-lift backdrop-blur-sm sm:p-14"
          >
            <h1 className="display text-[clamp(40px,5.4vw,60px)] leading-[1.05] text-ink">Get verified once</h1>
            <p className="mt-5 text-[19px] leading-relaxed text-ink-2">
              Prove you&rsquo;re an accredited investor in about 10 minutes, then reuse your passport with every fund for 90 days.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
              <Link to="/get-started">
                <Button size="lg" className="h-14 px-7 text-[19px]">
                  I&rsquo;m interested
                </Button>
              </Link>
              <Link to="/#qualify" className="link inline-flex items-center gap-0.5 text-[17px] font-semibold">
                See ways to qualify <ChevronRight className="size-4" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Who it's for: icon row */}
      <section className="border-b border-line bg-raised">
        <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-5 py-10 sm:px-8 md:grid-cols-4">
          {AUDIENCES.map((a) => (
            <li key={a.label}>
              <Link to={a.to} className="group flex flex-col items-center gap-3 text-center">
                <span className="grid size-16 place-items-center rounded-full border border-line text-accent transition-colors group-hover:border-accent group-hover:bg-accent/[0.06]">
                  <a.icon className="size-7" strokeWidth={1.5} />
                </span>
                <span className="text-[17px] text-ink group-hover:text-link group-hover:underline group-hover:underline-offset-4">{a.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Value tiles */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <h2 className="display text-center text-[clamp(30px,3.6vw,42px)] text-ink">Why investors use Savy</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { icon: Clock, title: 'Minutes, not weeks', body: 'Clean applications are approved automatically. No more waiting days for a CPA letter.', cta: 'Start now', to: '/get-started' },
            { icon: RefreshCw, title: 'Reuse it everywhere', body: 'One verification works with every participating fund, syndicate, and SPV for 90 days.', cta: 'For fund managers', to: '/#funds' },
            { icon: Lock, title: 'Your finances stay private', body: 'Funds see that you qualify. They never see your tax returns, balances, or income.', cta: 'How we protect you', to: '/#privacy' },
          ].map((t, i) => (
            <motion.div key={t.title} {...inView} transition={{ delay: i * 0.06 }} className="flex flex-col items-center border border-line bg-raised px-7 py-10 text-center shadow-card">
              <span className="grid size-14 place-items-center rounded-full bg-accent/10 text-accent">
                <t.icon className="size-6" strokeWidth={1.75} />
              </span>
              <h3 className="mt-6 text-[21px] font-semibold text-ink">{t.title}</h3>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{t.body}</p>
              <Link to={t.to} className="link mt-6 inline-flex items-center gap-0.5 text-[16px] font-semibold">
                {t.cta} <ChevronRight className="size-4" />
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Product showcase */}
      <section id="privacy" className="scroll-mt-6 bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:gap-16">
          <motion.div {...inView} className="mx-auto w-full max-w-[520px]">
            <PassportCard data={specimen} />
          </motion.div>
          <motion.div {...inView} transition={{ delay: 0.1 }}>
            <p className="eyebrow">The passport</p>
            <h2 className="display mt-3 text-[clamp(30px,3.6vw,42px)] leading-[1.1] text-ink">Funds see the verdict, not your finances</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <PrivacyList
                icon={<Eye className="size-4" />}
                title="What a fund sees"
                items={['Verified accredited status', 'Which test you passed', 'Issue and expiry dates', 'Attorney-signed letter reference']}
                tone="ok"
              />
              <PrivacyList
                icon={<EyeOff className="size-4" />}
                title="What stays with us"
                items={['Tax returns, W-2s, K-1s', 'Account balances', 'Your ID document', 'Exact income or net worth']}
                tone="neutral"
              />
            </div>
            <Link to="/get-started" className="mt-9 inline-block">
              <Button size="lg">Get my passport</Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Ways to qualify */}
      <section id="qualify" className="mx-auto max-w-6xl scroll-mt-6 px-5 py-20 sm:px-8">
        <h2 className="display text-center text-[clamp(30px,3.6vw,42px)] text-ink">Find the path that fits you</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-[17px] text-ink-2">You only need to meet one test. Pick whichever is easiest to prove.</p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PATHWAYS.map((p, i) => (
            <motion.div key={p.id} {...inView} transition={{ delay: i * 0.04 }} className="flex flex-col border border-line bg-raised p-7 shadow-card">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[20px] font-semibold text-ink">{p.title}</h3>
                <span className="text-[14px] text-ink-3">{p.time}</span>
              </div>
              <p className="mt-3 flex-1 text-[16px] leading-relaxed text-ink-2">{p.requirement(p.allowed('individual') ? 'individual' : 'entity')}</p>
              <p className="mt-4 border-t border-line pt-4 text-[14px] text-ink-3">{p.evidence}</p>
            </motion.div>
          ))}
          <motion.div {...inView} className="flex flex-col justify-center bg-navy p-7 text-white">
            <h3 className="text-[20px] font-semibold">Not sure which applies?</h3>
            <p className="mt-3 text-[16px] leading-relaxed text-white/80">Start the check. We only show the paths open to you.</p>
            <Link to="/get-started" className="mt-5 inline-flex items-center gap-0.5 text-[16px] font-semibold text-white hover:underline">
              Check my eligibility <ChevronRight className="size-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-6 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="display text-center text-[clamp(30px,3.6vw,42px)] text-ink">How it works</h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3">
            {[
              { icon: Fingerprint, title: 'Confirm who you are', body: 'Scan a government ID. We run sanctions and politically exposed person screening at the same time.' },
              { icon: FileCheck2, title: 'Show how you qualify', body: 'Link accounts, upload tax documents, or enter your license. An attorney signs every letter.' },
              { icon: Send, title: 'Share with any fund', body: 'Send your verified status in one click. Refresh in minutes when it expires.' },
            ].map((s, i) => (
              <motion.li key={s.title} {...inView} transition={{ delay: i * 0.06 }} className="flex gap-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-[18px] font-semibold text-on-accent">{i + 1}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[19px] font-semibold text-ink">{s.title}</h3>
                    <s.icon className="size-4 text-ink-3" strokeWidth={1.75} />
                  </div>
                  <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{s.body}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Proof points */}
      <section className="mx-auto max-w-6xl px-5 pt-20 sm:px-8">
        <dl className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((x) => (
            <div key={x.v} className="bg-raised px-6 py-8 text-center">
              <dt className="display text-[44px] leading-none text-accent">{x.k}</dt>
              <dd className="mt-3 text-[16px] text-ink-2">{x.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 pt-20 sm:px-8">
        <h2 className="display text-center text-[clamp(30px,3.6vw,42px)] text-ink">Common questions</h2>
        <div className="mt-10 divide-y divide-line border-y border-line">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[18px] text-ink marker:hidden">
                {f.q}
                <ChevronDown className="size-5 shrink-0 text-accent transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="mt-3 pr-10 text-[16px] leading-relaxed text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* For funds */}
      <section id="funds" className="mx-auto max-w-6xl scroll-mt-6 px-5 pt-20 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-8 bg-navy px-8 py-12 text-white sm:px-14 md:flex-row md:items-center">
          <div className="max-w-xl">
            <p className="text-[13px] font-semibold tracking-[0.08em] text-white/70 uppercase">For fund managers</p>
            <h2 className="display mt-3 text-[clamp(28px,3.4vw,38px)] leading-[1.12]">Accept passports and close 506(c) rounds faster</h2>
            <p className="mt-3 text-[16px] leading-relaxed text-white/80">Every passport comes with an attorney-signed letter and a full audit file: your documented &ldquo;reasonable steps.&rdquo;</p>
          </div>
          <Link to="/get-started">
            <Button size="lg" className="h-14 bg-white px-7 text-[18px] text-navy hover:bg-white/90">
              Get started <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </section>
    </>
  )
}

function PrivacyList({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone: 'ok' | 'neutral' }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className={tone === 'ok' ? 'grid size-7 place-items-center rounded-full bg-ok-soft text-ok' : 'grid size-7 place-items-center rounded-full bg-ink/5 text-ink-2'}>{icon}</span>
        <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
      </div>
      <ul className="mt-4 space-y-2.5">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-3 text-[16px] text-ink-2">
            <span className={tone === 'ok' ? 'mt-2.5 size-1.5 shrink-0 rounded-full bg-ok' : 'mt-2.5 size-1.5 shrink-0 rounded-full bg-ink-3/50'} />
            {it}
          </li>
        ))}
      </ul>
    </div>
  )
}
