import { BrainCircuit, Eye, FileSignature, Fingerprint, KeyRound, Lock, Scale, ScrollText, ShieldCheck, UserCheck } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

// Status reflects the real state of Savy's program. "Built in" = shipped product behavior. Anything that
// depends on an audit, a vendor or counsel stays "In preparation" until it actually exists; never upgrade a
// status here without the evidence (an audit report, signed policy, counsel sign-off).
type Status = 'built' | 'preparing' | 'monitoring'

const STATUS: Record<Status, { label: string; cls: string }> = {
  built: { label: 'Built in', cls: 'bg-ok-soft text-ok' },
  preparing: { label: 'In preparation', cls: 'bg-warn-soft text-warn' },
  monitoring: { label: 'Monitoring', cls: 'bg-ink/[0.06] text-ink-2' },
}

const PRINCIPLES = [
  { icon: Eye, title: 'Funds see the verdict, not the file', body: 'An issuer receives status, basis, dates and the letter reference. Documents, balances and income never leave Savy.' },
  { icon: KeyRound, title: 'Read-only connections', body: 'Linked accounts share balances only. Savy can’t move money or change anything at your bank.' },
  { icon: UserCheck, title: 'You control sharing', body: 'Each fund gets access only when you share or accept its invite, and you can revoke it at any time.' },
  { icon: ScrollText, title: 'An audit trail for every decision', body: 'Every check is timestamped and kept as the record of reasonable steps a fund needs under Rule 506(c).' },
]

const AI_POINTS = [
  { title: 'What the AI does', body: 'Reads uploaded documents, extracts the figures the rules need, and flags inconsistencies such as mismatched names or stale statements.' },
  { title: 'What decides', body: 'The accreditation thresholds in Rule 501(a) are applied by fixed, explainable rules. The AI supplies inputs; it does not set the bar.' },
  { title: 'Human oversight', body: 'Results below 90% confidence are escalated to qualified review before anyone is cleared, and you can ask for a person to review any outcome.' },
  { title: 'Notice and explanation', body: 'You’re told when automated processing is used and shown which checks passed, so a decision is never a black box.' },
]

type Row = { name: string; covers: string; how: string; status: Status; icon: typeof Scale }

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Securities & financial crime',
    rows: [
      { icon: Scale, name: 'SEC Rule 506(c)', covers: 'Issuers must take reasonable steps to verify every purchaser is accredited.', how: 'A documented, timestamped verification record and letter for each investor.', status: 'built' },
      { icon: Fingerprint, name: 'BSA/AML & OFAC', covers: 'Sanctions and politically exposed person screening.', how: 'ID verification and OFAC/PEP screening run in every application.', status: 'built' },
      { icon: FileSignature, name: 'E-SIGN Act', covers: 'Validity of electronic signatures and consent.', how: 'Clickwrap signature with clear language, recorded against the signer’s legal name.', status: 'built' },
    ],
  },
  {
    title: 'AI & automated decisions',
    rows: [
      { icon: BrainCircuit, name: 'Colorado AI Act (SB 26-189)', covers: 'Automated decision-making in consequential decisions, including financial services. Effective Jan 1, 2027.', how: 'Notices, human review on request, and records of how each decision was reached.', status: 'preparing' },
      { icon: BrainCircuit, name: 'California CCPA ADMT rules', covers: 'Notice, access and opt-out rights for automated decisions that significantly affect consumers. Compliance by Jan 1, 2027.', how: 'Pre-use notice, explanation of checks, and a path to human review.', status: 'preparing' },
      { icon: BrainCircuit, name: 'EU AI Act', covers: 'Obligations for high-risk AI systems, now due Dec 2, 2027. Applies if Savy serves EU investors.', how: 'Risk management, logging and human oversight designed in from the start.', status: 'monitoring' },
    ],
  },
  {
    title: 'Privacy & data security',
    rows: [
      { icon: ShieldCheck, name: 'SOC 2 Type II', covers: 'Independent audit of security, availability and confidentiality controls over time.', how: 'Access control, encryption, change management and monitoring, audited by a third party.', status: 'preparing' },
      { icon: Lock, name: 'GLBA & Regulation S-P', covers: 'Safeguards and privacy notices for nonpublic personal financial information.', how: 'A written information security program, vendor oversight and incident response.', status: 'preparing' },
      { icon: Lock, name: 'State privacy laws (CCPA/CPRA and others)', covers: 'Rights to know, correct and delete personal information.', how: 'Data minimization, retention limits and self-serve access and deletion requests.', status: 'preparing' },
      { icon: ScrollText, name: 'FCRA', covers: 'Permissible purpose and consent when using consumer credit reports.', how: 'Savy doesn’t pull credit reports today. Consent and adverse-action notices ship with any future credit check.', status: 'monitoring' },
    ],
  },
]

const inView = { initial: { opacity: 0, y: 14 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' } }

export default function Security() {
  return (
    <>
      <section className="border-b border-line bg-navy text-white">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <p className="text-[13px] font-semibold tracking-[0.08em] text-white/60 uppercase">Security & compliance</p>
          <h1 className="display mt-4 max-w-3xl text-[clamp(36px,5vw,56px)] leading-[1.05]">Built for the rules that govern investor data and automated decisions.</h1>
          <p className="mt-5 max-w-2xl text-[18px] leading-relaxed text-white/80">Verification touches the most sensitive data an investor has. Here is how Savy handles it, and where each program stands today.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <h2 className="display text-[clamp(28px,3.4vw,38px)] text-ink">How we protect investor data</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p, i) => (
            <motion.div key={p.title} {...inView} transition={{ delay: i * 0.05 }} className="border border-line bg-raised p-6 shadow-card">
              <p.icon className="size-6 text-accent" strokeWidth={1.5} />
              <h3 className="mt-4 text-[18px] font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="eyebrow">Responsible AI</p>
            <h2 className="display mt-3 text-[clamp(28px,3.4vw,38px)] leading-[1.12] text-ink">AI reads the documents. Rules make the call.</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-2">Accreditation is a consequential financial decision, and new AI laws treat it that way. Savy is designed around transparency and human oversight.</p>
          </div>
          <dl className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
            {AI_POINTS.map((a) => (
              <div key={a.title} className="bg-raised p-6">
                <dt className="text-[16px] font-semibold text-ink">{a.title}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-ink-2">{a.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="display text-[clamp(28px,3.4vw,38px)] text-ink">Regulations and frameworks</h2>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS) as Status[]).map((k) => (
              <StatusChip key={k} status={k} />
            ))}
          </div>
        </div>
        <div className="mt-8 grid gap-8">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="text-[15px] font-semibold tracking-wide text-ink-3 uppercase">{g.title}</h3>
              <ul className="mt-3 divide-y divide-line border border-line bg-raised shadow-card">
                {g.rows.map((r) => (
                  <motion.li key={r.name} {...inView} className="grid gap-3 px-6 py-5 md:grid-cols-[220px_1fr_1fr_auto] md:items-start md:gap-6">
                    <p className="flex items-center gap-2.5 text-[17px] font-semibold text-ink">
                      <r.icon className="size-5 shrink-0 text-accent" strokeWidth={1.5} />
                      {r.name}
                    </p>
                    <Cell label="What it covers">{r.covers}</Cell>
                    <Cell label="How Savy addresses it">{r.how}</Cell>
                    <div className="md:pt-0.5">
                      <StatusChip status={r.status} />
                    </div>
                  </motion.li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-[13px] leading-relaxed text-ink-3">
          Status reflects Savy&rsquo;s program as of October 2026 and will be updated as audits and reviews complete. Regulatory dates are summarized for convenience; this page is not legal advice.
        </p>
      </section>
    </>
  )
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase md:hidden">{label}</p>
      <p className="text-[15px] leading-relaxed text-ink-2">{children}</p>
    </div>
  )
}

function StatusChip({ status }: { status: Status }) {
  const s = STATUS[status]
  return <span className={cn('inline-flex h-7 items-center rounded-full px-3 text-[13px] font-semibold whitespace-nowrap', s.cls)}>{s.label}</span>
}
