import { ArrowRight, BadgeCheck, Building2, Check, ChevronRight, CircleHelp, Clock, FileCheck2, Fingerprint, Lock, PenLine, ShieldCheck, User, UserCheck, Users } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { cn } from '../lib/cn'
import { PATHWAYS } from '../lib/rules'
import type { InvestorType } from '../lib/types'

const TYPES: { id: InvestorType; label: string; icon: typeof User }[] = [
  { id: 'individual', label: 'Just me', icon: User },
  { id: 'joint', label: 'Me and my spouse', icon: Users },
  { id: 'entity', label: 'An entity or trust', icon: Building2 },
]

const NEEDS: Record<InvestorType, string[]> = {
  individual: ['A government-issued photo ID', 'Online banking or brokerage login, or recent statements', 'Or: W-2s / 1040s for the last two years', 'Or: your FINRA CRD number if you hold a Series 7, 65, or 82'],
  joint: ['Photo ID for the primary investor', 'Joint account logins or statements', 'Or: joint 1040s for the last two years', 'Your spouse’s legal name'],
  entity: ['Photo ID for an authorized signer', 'The entity’s legal name and type', 'Recent financial statements or a CPA letter', 'For trusts: the trust agreement'],
}

function steps(t: InvestorType) {
  const paths = PATHWAYS.filter((p) => p.allowed(t)).map((p) => p.title.toLowerCase())
  return [
    { icon: UserCheck, title: 'Tell us how you’re investing', body: t === 'entity' ? 'Enter the entity’s legal name and type, plus details for the person signing.' : 'Your legal name and email, exactly as they appear on your ID.', time: '1 min' },
    { icon: Fingerprint, title: 'Confirm your identity', body: 'Scan your ID and take a quick selfie. We screen sanctions and PEP lists at the same time.', time: '1 min' },
    {
      icon: FileCheck2,
      title: 'Show how you qualify',
      body: `Choose one: ${paths.join(', ').replace(/, ([^,]*)$/, ', or $1')}.${t === 'entity' ? ' Upload the entity’s statements or sign a commitment statement.' : ' Link accounts for the fastest result.'}`,
      time: '3–5 min',
    },
    { icon: PenLine, title: 'Review and sign', body: 'Confirm your answers and e-sign two short statements.', time: '1 min' },
    { icon: BadgeCheck, title: 'Get your passport', body: 'Most applications are approved in minutes. Anything unusual goes to a licensed attorney.', time: 'Minutes' },
  ]
}

const OUTCOMES = [
  { tone: 'ok', title: 'Approved', body: 'Your passport is issued right away with an attorney-signed letter. Share it with any fund.', time: 'Usually minutes' },
  { tone: 'warn', title: 'Attorney review', body: 'Joint filings, trusts, or anything unusual gets a human look. We email you when it’s done.', time: 'Usually 1 business day' },
  { tone: 'neutral', title: 'More info needed', body: 'If something’s missing, we tell you exactly what. Your progress is saved, so fixing it takes a minute.', time: 'You choose when' },
] as const

export default function GetStarted() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('type')
  const type: InvestorType = raw === 'joint' || raw === 'entity' ? raw : 'individual'
  const list = steps(type)

  return (
    <>
      {/* Page header band */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 pt-8 pb-12 sm:px-8">
          <nav className="flex items-center gap-1 text-[15px] text-ink-3" aria-label="Breadcrumb">
            <Link to="/" className="link">
              Home
            </Link>
            <ChevronRight className="size-4" />
            <span className="text-ink-2">Get verified</span>
          </nav>
          <h1 className="display mt-6 text-[clamp(36px,4.8vw,54px)] leading-[1.06] text-ink">Here&rsquo;s how getting verified works</h1>
          <p className="mt-4 max-w-2xl text-[19px] leading-relaxed text-ink-2">
            It takes about 10 minutes. Your progress saves as you go, and nothing is shared with a fund until you choose to share it.
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_380px] lg:gap-16">
        <div>
          {/* Who's investing */}
          <h2 className="text-[22px] font-semibold text-ink">Who&rsquo;s investing?</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Who's investing">
            {TYPES.map((t) => {
              const on = t.id === type
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setParams({ type: t.id }, { replace: true })}
                  className={cn(
                    'flex items-center gap-3 rounded-[6px] border bg-raised px-4 py-4 text-left text-[17px] transition-[border-color,box-shadow]',
                    on ? 'border-accent text-ink shadow-[0_0_0_1px_var(--accent)]' : 'border-line-strong text-ink-2 hover:border-ink-2',
                  )}
                >
                  <t.icon className={cn('size-5 shrink-0', on ? 'text-accent' : 'text-ink-3')} strokeWidth={1.75} />
                  {t.label}
                  {on && <Check className="ml-auto size-4 text-accent" strokeWidth={2.5} />}
                </button>
              )
            })}
          </div>

          {/* Process timeline */}
          <h2 className="mt-14 text-[22px] font-semibold text-ink">The process</h2>
          <ol className="mt-6">
            {list.map((s, i) => (
              <motion.li
                key={s.title}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ delay: i * 0.06 }}
                className="relative grid grid-cols-[48px_1fr] gap-5 pb-9 last:pb-0"
              >
                {i < list.length - 1 && <span className="absolute top-12 bottom-0 left-[23.5px] w-px bg-line-strong/60" aria-hidden />}
                <span className={cn('relative grid size-12 place-items-center rounded-full', i === list.length - 1 ? 'bg-mint text-white' : 'bg-accent text-on-accent')}>
                  <s.icon className="size-5" strokeWidth={1.75} />
                </span>
                <div className="pt-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-[19px] font-semibold text-ink">
                      <span className="mr-1.5 text-ink-3">{i + 1}.</span>
                      {s.title}
                    </h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-[14px] text-ink-2">
                      <Clock className="size-3.5" /> {s.time}
                    </span>
                  </div>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p key={s.body} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-1.5 max-w-xl text-[16px] leading-relaxed text-ink-2">
                      {s.body}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>

        {/* Sticky action card */}
        <aside>
          <div className="sticky top-6 border border-line bg-raised p-7 shadow-card">
            <h2 className="text-[20px] font-semibold text-ink">What you&rsquo;ll need</h2>
            <AnimatePresence mode="wait" initial={false}>
              <motion.ul key={type} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="mt-4 space-y-3">
                {NEEDS[type].map((n) => (
                  <li key={n} className="flex items-start gap-3 text-[16px] text-ink-2">
                    <Check className="mt-1 size-4 shrink-0 text-ok" strokeWidth={2.5} />
                    {n}
                  </li>
                ))}
              </motion.ul>
            </AnimatePresence>
            <Link to={`/verify?type=${type}`} className="mt-7 block">
              <Button size="lg" className="h-14 w-full text-[18px]">
                Start verification <ArrowRight className="size-4" />
              </Button>
            </Link>
            <ul className="mt-6 space-y-2.5 border-t border-line pt-5 text-[15px] text-ink-2">
              <li className="flex items-center gap-2.5">
                <ShieldCheck className="size-4 text-accent" /> No credit check, no impact on your score
              </li>
              <li className="flex items-center gap-2.5">
                <Lock className="size-4 text-accent" /> Encrypted, and never shared with funds
              </li>
              <li className="flex items-center gap-2.5">
                <CircleHelp className="size-4 text-accent" /> Save and finish later on this device
              </li>
            </ul>
            <p className="mt-6 text-[15px] text-ink-3">
              Already verified?{' '}
              <Link to="/find" className="link font-semibold">
                Open your passport
              </Link>
            </p>
          </div>
        </aside>
      </div>

      {/* What happens next */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <h2 className="display text-center text-[clamp(28px,3.4vw,38px)] text-ink">What happens after you submit</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {OUTCOMES.map((o, i) => (
              <motion.div key={o.title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="border border-line bg-raised p-7 shadow-card">
                <span className={cn('inline-block h-1 w-10 rounded-full', o.tone === 'ok' ? 'bg-ok' : o.tone === 'warn' ? 'bg-warn' : 'bg-line-strong')} />
                <h3 className="mt-5 text-[20px] font-semibold text-ink">{o.title}</h3>
                <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{o.body}</p>
                <p className="mt-4 text-[14px] font-semibold tracking-wide text-ink-3 uppercase">{o.time}</p>
              </motion.div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link to={`/verify?type=${type}`}>
              <Button size="lg" className="h-14 px-8 text-[18px]">
                I&rsquo;m ready, let&rsquo;s start
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
