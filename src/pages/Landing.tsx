// Copy source: design/copy/savy-website-copy.pdf. Bracketed placeholders there (stats, pricing,
// testimonials) are intentionally left out until real numbers exist.

import { BadgeCheck, Ban, Briefcase, Building2, CalendarCheck, Check, ChevronDown, ChevronRight, FileCheck2, FileWarning, FolderCheck, Gavel, Moon, Repeat, Send, ShieldCheck, Undo2, User, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { PassportCard } from '../components/PassportCard'
import { Photo } from '../components/Photo'
import type { PhotoKey } from '../lib/photos'
import { Button } from '../components/ui/button'
import { PATHWAYS } from '../lib/rules'


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

const STEPS = [
  { icon: Send, title: 'Invite', body: 'Send your LPs one Savy link. No account setup on your side.' },
  { icon: FileCheck2, title: 'Verify', body: 'Investors connect accounts or upload documents once. Savy\u2019s AI reviews them in minutes.' },
  { icon: FolderCheck, title: 'Close', body: 'You get a verification letter and an audit-ready file for every investor.' },
]

const OUTCOMES: { icon: typeof CalendarCheck; title: string; body: string; photo: PhotoKey }[] = [
  { photo: 'img02', icon: CalendarCheck, title: 'Close on schedule', body: 'Every LP cleared before your first close. The wire is the only thing left.' },
  { photo: 'img19', icon: Moon, title: 'Sleep through the audit', body: 'One clean file per purchaser, timestamped and ready to hand over. If we got one wrong, it’s our problem.' },
  { photo: 'img09', icon: ShieldCheck, title: 'Treat LPs like LPs', body: 'Your investors never email a tax return to your inbox. They notice.' },
  { photo: 'img18', icon: Repeat, title: 'Verified once, reused', body: 'Investors carry their status to the next Savy deal. No repeat paperwork.' },
]

// Consequences of a failed 506(c) verification, per plan.md section 11. Keep these factual: they are
// what makes the risk real, and overstating them would undercut the credibility we sell.
const STAKES = [
  { icon: FileWarning, title: 'Your exemption, gone', body: 'Can’t show reasonable steps to verify? The raise can lose its Rule 506 exemption and become an unregistered offering.' },
  { icon: Undo2, title: 'Every LP can ask for their money back', body: 'Rescission rights let purchasers demand their investment back, with interest. Not just the one who wasn’t accredited.' },
  { icon: Gavel, title: 'The SEC, personally', body: 'Cease-and-desist orders, disgorgement and civil penalties. Control persons, meaning you, can be held personally liable.' },
  { icon: Ban, title: 'Your next fund, too', body: 'State regulators can act on their own, and a violation can disqualify you from future Rule 506 offerings.' },
]

const FOR_FUNDS = [
  ['We take on the liability.', 'If an investor Savy cleared turns out not to be accredited, that’s on us, not you.'],
  ['One link per raise.', 'No portals, no spreadsheets, no email attachments.'],
  ['Live LP status.', 'Cleared, pending, expired, all in one view.'],
  ['Audit-ready by default.', 'A timestamped verification record per purchaser.'],
  ['Entity investors handled.', 'Trusts, LLCs and look-throughs are flagged before they block your close.'],
]

const FOR_INVESTORS = [
  ['Private by design.', 'Funds see your status, not your statements.'],
  ['Minutes, not weeks.', 'No CPA letter, no $300 invoice, no two-week wait.'],
  ['Once, then done.', 'Your verification travels with you to the next Savy deal.'],
  ['Spouse-friendly.', 'Joint filers verify together in one flow.'],
]

const STATS = [
  { k: '~10 min', v: 'to verify, start to finish' },
  { k: '90 days', v: 'each passport stays valid' },
  { k: '1 click', v: 'to share with the next fund' },
  { k: '0', v: 'documents sent to funds' },
]

const FAQ = [
  { q: '“We just use a checkbox.”', a: 'Under 506(c), self-certification alone doesn’t count as verification. If one LP isn’t really accredited, a checkbox won’t save the exemption, and every investor in the round can ask for their money back. Savy is the step that does count.' },
  { q: '“Who’s on the hook if a verification is wrong?”', a: 'We are. When Savy clears an investor, we take on the liability for that verification under the Savy Verification Guarantee, and you keep a documented, timestamped record of the reasonable steps taken.' },
  { q: '“Our checks are over $200K.”', a: 'The 2025 SEC staff guidance helps, but it’s non-binding and needs written representations. Savy collects those too, so every investor is covered either way.' },
  { q: '“Our LPs hate paperwork.”', a: 'So do we. With account connections, most investors never upload a document.' },
  { q: '“Why should I trust you with my data?”', a: 'Read-only account connections, encrypted storage, and funds only ever see your status, never your statements.' },
  { q: '“I already sent this to another fund.”', a: 'Then you know why we built Savy.' },
]

const inView = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
}

export default function Landing() {
  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <Photo name="img12" priority decorative className="absolute inset-0 -z-10 size-full" position="70% center" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/25 via-black/5 to-transparent" aria-hidden />
        <div className="mx-auto flex min-h-[560px] max-w-6xl items-center px-5 py-16 sm:px-8 lg:min-h-[640px]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[620px] bg-raised/95 p-8 shadow-lift backdrop-blur-sm sm:p-14"
          >
            <h1 className="display text-[clamp(38px,5vw,56px)] leading-[1.05] text-ink">Every LP verified in 10 minutes. Not 10 days.</h1>
            <p className="mt-5 text-[19px] leading-relaxed text-ink-2">Your LPs stop sending bank statements, and your raise stops waiting on them.</p>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
              <Link to="/get-started">
                <Button size="lg" className="h-14 px-7 text-[19px]">
                  Start verifying
                </Button>
              </Link>
              <Link to="/#how" className="link inline-flex items-center gap-0.5 text-[17px] font-semibold">
                See how it works <ChevronRight className="size-4" />
              </Link>
            </div>
            <p className="mt-8 border-t border-line pt-5 text-[14px] text-ink-3">We take on the verification liability · Built for Rule 506(c) · Investor data never touches your inbox</p>
          </motion.div>
        </div>
      </section>

      {/* Who it's for */}
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

      {/* Problem */}
      <section className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-8">
        <p className="eyebrow">The part nobody budgets time for</p>
        <h2 className="display mt-4 text-[clamp(30px,3.8vw,44px)] leading-[1.1] text-ink">Your round is oversubscribed. Your close is three weeks late.</h2>
        <p className="mt-6 text-[18px] leading-relaxed text-ink-2">
          A 506(c) raise needs more than a checkbox: two years of tax returns, statements from the last three months, and a file for every LP. So your team chases PDFs while your investors wonder why a fund they trust wants their bank statements.
        </p>
      </section>

      {/* What's at stake */}
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <p className="text-[13px] font-semibold tracking-[0.08em] text-white/60 uppercase">What&rsquo;s at stake</p>
          <h2 className="display mt-4 max-w-3xl text-[clamp(30px,3.8vw,44px)] leading-[1.1]">One unverified LP can unwind your entire raise.</h2>
          <div className="mt-12 grid gap-px overflow-hidden bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {STAKES.map((x, i) => (
              <motion.div key={x.title} {...inView} transition={{ delay: i * 0.06 }} className="bg-navy p-7">
                <x.icon className="size-6 text-mint" strokeWidth={1.5} />
                <h3 className="mt-5 text-[19px] font-semibold">{x.title}</h3>
                <p className="mt-2 text-[16px] leading-relaxed text-white/75">{x.body}</p>
              </motion.div>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-start justify-between gap-6 border-t border-white/15 pt-8 md:flex-row md:items-center">
            <p className="max-w-2xl text-[18px] leading-relaxed text-white/85">
              The rule protects issuers who can prove a reasonable, documented process. <span className="font-semibold text-white">Savy is that process, and we take on the liability for it.</span>
            </p>
            <Link to="/get-started">
              <Button size="lg" className="h-14 shrink-0 bg-white px-7 text-[18px] text-navy hover:bg-white/90">
                Protect my raise
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-[13px] text-white/50">Consequences depend on your offering and the facts. Savy does not provide legal advice; talk to counsel about how Rule 506(c) applies to you.</p>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-6 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="display text-center text-[clamp(30px,3.6vw,42px)] text-ink">Three steps. Zero chasing.</h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
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

      {/* Outcomes */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <h2 className="display text-center text-[clamp(30px,3.6vw,42px)] text-ink">What it feels like on the other side</h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {OUTCOMES.map((o, i) => (
            <motion.div key={o.title} {...inView} transition={{ delay: i * 0.05 }} className="group overflow-hidden border border-line bg-raised shadow-card">
              <div className="aspect-[3/2] overflow-hidden">
                <Photo name={o.photo} sizes="(min-width: 1024px) 280px, (min-width: 640px) 50vw, 100vw" className="size-full transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2.5">
                  <o.icon className="size-5 text-accent" strokeWidth={1.75} />
                  <h3 className="text-[19px] font-semibold text-ink">{o.title}</h3>
                </div>
                <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{o.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Two audiences */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-5 px-5 py-20 sm:px-8 lg:grid-cols-2">
          <AudienceCard
            id="funds"
            eyebrow="For funds and issuers"
            title="The last thing standing between you and your close. Gone."
            sub="Savy verifies every LP in your 506(c) raise, hands you an audit-ready file, and takes on the liability if a verification is wrong."
            items={FOR_FUNDS}
            photo="img11"
            cta={{ label: 'Start verifying', to: '/get-started' }}
          />
          <AudienceCard
            id="investors"
            eyebrow="For investors"
            title="Accredited, once. Invested, everywhere."
            sub="Verify privately in about 10 minutes. Your tax returns never go to a fund manager’s inbox."
            items={FOR_INVESTORS}
            photo="img13"
            cta={{ label: 'Verify my status', to: '/get-started' }}
          />
        </div>
      </section>

      {/* Passport showcase */}
      <section id="privacy" className="mx-auto grid max-w-6xl scroll-mt-6 items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <motion.div {...inView} className="mx-auto w-full max-w-[520px]">
          <PassportCard data={specimen} />
        </motion.div>
        <motion.div {...inView} transition={{ delay: 0.1 }}>
          <p className="eyebrow">The Verify-Once Pass</p>
          <h2 className="display mt-3 text-[clamp(30px,3.6vw,42px)] leading-[1.1] text-ink">The fund gets a yes, not your financial life.</h2>
          <ul className="mt-7 space-y-3 text-[17px] text-ink-2">
            {['Your documents go to Savy, not the fund.', 'Funds see your status, the test you passed and the dates.', 'Re-verify in about a minute when the window closes.'].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <BadgeCheck className="mt-0.5 size-5 shrink-0 text-accent" strokeWidth={1.75} />
                {t}
              </li>
            ))}
          </ul>
        </motion.div>
      </section>

      {/* Ways to qualify */}
      <section id="qualify" className="scroll-mt-6 border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="display text-center text-[clamp(30px,3.6vw,42px)] text-ink">One test is all it takes</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {PATHWAYS.map((p, i) => (
              <motion.div key={p.id} {...inView} transition={{ delay: i * 0.04 }} className="border border-line bg-raised p-6 shadow-card">
                <h3 className="text-[18px] font-semibold text-ink">{p.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{p.requirement(p.allowed('individual') ? 'individual' : 'entity')}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Celebration band */}
      <section className="relative isolate mt-20 overflow-hidden">
        <Photo name="img16" decorative className="absolute inset-0 -z-10 size-full" position="center 35%" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#022a21]/85 via-[#022a21]/45 to-transparent" aria-hidden />
        <div className="mx-auto flex min-h-[440px] max-w-6xl items-center px-5 py-16 sm:px-8">
          <motion.div {...inView} className="max-w-md text-white">
            <p className="text-[13px] font-semibold tracking-[0.08em] text-white/70 uppercase">Closing day</p>
            <h2 className="display mt-3 text-[clamp(32px,4vw,48px)] leading-[1.08]">The wire is the only thing left.</h2>
            <p className="mt-4 text-[18px] leading-relaxed text-white/85">Every LP cleared before your first close. No last-minute PDFs, no surprises.</p>
          </motion.div>
        </div>
      </section>

      {/* Proof */}
      <section className="mx-auto max-w-6xl px-5 pt-20 sm:px-8">
        <h2 className="display mx-auto max-w-3xl text-center text-[clamp(28px,3.4vw,38px)] leading-[1.15] text-ink">Built for the people who sign the checks, and the people who cash them</h2>
        <dl className="mt-10 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((x) => (
            <div key={x.v} className="bg-raised px-6 py-8 text-center">
              <dt className="display text-[44px] leading-none text-accent">{x.k}</dt>
              <dd className="mt-3 text-[16px] text-ink-2">{x.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Objections */}
      <section className="mx-auto max-w-3xl px-5 pt-20 sm:px-8">
        <h2 className="display text-center text-[clamp(30px,3.6vw,42px)] text-ink">What people ask us</h2>
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

      {/* Closing CTA */}
      <section className="mx-auto max-w-6xl px-5 pt-20 sm:px-8">
        <div className="relative isolate flex flex-col items-start justify-between gap-8 overflow-hidden px-8 py-16 text-white sm:px-14 md:flex-row md:items-center">
          <Photo name="img20" decorative className="absolute inset-0 -z-10 size-full" position="center 60%" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#022a21]/90 via-[#022a21]/60 to-[#022a21]/20" aria-hidden />
          <div className="max-w-xl">
            <h2 className="display text-[clamp(28px,3.4vw,40px)] leading-[1.12]">Your next close is already on the calendar. Let&rsquo;s keep it there.</h2>
            <p className="mt-3 text-[17px] text-white/80">Don&rsquo;t bet the raise on a checkbox. Your first investor can be verified today, with the liability on us.</p>
          </div>
          <Link to="/get-started">
            <Button size="lg" className="h-14 bg-white px-7 text-[18px] text-navy hover:bg-white/90">
              Start verifying
            </Button>
          </Link>
        </div>
      </section>
    </>
  )
}

function AudienceCard({ id, eyebrow, title, sub, items, cta, photo }: { id: string; eyebrow: string; title: string; sub: string; items: string[][]; cta: { label: string; to: string }; photo: PhotoKey }) {
  return (
    <motion.div id={id} {...inView} className="flex scroll-mt-6 flex-col overflow-hidden border border-line bg-raised shadow-card">
      <div className="aspect-[21/9] overflow-hidden">
        <Photo name={photo} sizes="(min-width: 1024px) 560px, 100vw" className="size-full" position="right center" />
      </div>
      <div className="flex flex-1 flex-col p-8 sm:p-10">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="display mt-3 text-[clamp(26px,2.8vw,32px)] leading-[1.15] text-ink">{title}</h2>
      <p className="mt-3 text-[17px] leading-relaxed text-ink-2">{sub}</p>
      <ul className="mt-7 flex-1 space-y-3.5">
        {items.map(([k, v]) => (
          <li key={k} className="flex items-start gap-3 text-[16px] leading-relaxed text-ink-2">
            <Check className="mt-1 size-4 shrink-0 text-accent" strokeWidth={2.5} />
            <span>
              <span className="font-semibold text-ink">{k}</span> {v}
            </span>
          </li>
        ))}
      </ul>
      <Link to={cta.to} className="mt-8">
        <Button variant="secondary" size="lg">
          {cta.label}
        </Button>
      </Link>
      </div>
    </motion.div>
  )
}
