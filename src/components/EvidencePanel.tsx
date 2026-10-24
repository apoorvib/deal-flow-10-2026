// "How this was verified": the integration evidence behind a decision, read from the checks the backend
// returns. Only what the checks actually say is shown; anything the API doesn't return is labelled as such
// rather than guessed. akta.pro data is corroboration only and is never presented as accreditation evidence.

import { BrainCircuit, Building2, ScanSearch, ScrollText, Waypoints } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import type { Check, InvestorType, Pathway } from '../lib/types'

type Tone = 'ok' | 'warn' | 'danger' | 'neutral'

const TONE: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-ink/[0.06] text-ink-2',
}

const CONFLICT_ID = 'agent_validator_conflict'
const DEGRADED = 'Automated review incomplete'

interface Row {
  icon: ReactNode
  source: string
  title: string
  status: string
  tone: Tone
  lines: string[]
  note?: string
}

function documentRow(checks: Check[]): Row {
  const docs = checks.filter((c) => c.id.startsWith('doc_'))
  const conflict = checks.find((c) => c.id === CONFLICT_ID)
  const cross = checks.find((c) => c.id === 'cross_document')
  const degraded = docs.filter((c) => c.detail.includes(DEGRADED))
  const flagged = docs.filter((c) => c.result !== 'pass' && !c.detail.includes(DEGRADED))
  const base = { icon: <BrainCircuit className="size-5" />, source: 'Nicrron', title: 'Document debate' }
  if (!docs.length) return { ...base, status: 'No documents', tone: 'neutral', lines: ['This application didn’t include documents to review.'] }
  const lines = [`${docs.length} document${docs.length === 1 ? '' : 's'} reviewed by independent AI models`]
  if (flagged.length) lines.push(`${flagged.length} flagged: ${flagged.map((c) => c.label).join(', ')}`)
  if (degraded.length) lines.push(`${degraded.length} couldn’t be fully reviewed automatically`)
  if (cross) lines.push(cross.result === 'pass' ? 'Documents consistent with each other' : `Cross-document issue: ${cross.detail}`)
  if (conflict) lines.push('AI reviewers disagreed with the rules, so the case is held for review')
  const tone: Tone = degraded.length || conflict || flagged.length ? 'warn' : 'ok'
  const status = degraded.length ? 'Degraded' : conflict ? 'Conflict held' : flagged.length ? 'Flagged' : 'Agreed'
  return { ...base, status, tone, lines }
}

function brokerCheckRow(checks: Check[], pathway: Pathway | null): Row | null {
  const test = checks.find((c) => c.id === 'pathway' && c.detail.includes('BrokerCheck'))
  if (pathway !== 'license' && !test) return null
  const name = checks.find((c) => c.id === 'license_name')
  const base = { icon: <ScanSearch className="size-5" />, source: 'Solari', title: 'FINRA BrokerCheck' }
  if (!test) return { ...base, status: 'Not reported', tone: 'neutral', lines: ['No BrokerCheck result came back for this application.'] }
  const lines = [test.result === 'pass' ? 'Active registration found on FINRA BrokerCheck' : 'No active registration found on FINRA BrokerCheck']
  lines.push(test.detail.includes('cached') ? 'Lookup: served from cache' : 'Lookup: live')
  if (name) lines.push(name.detail)
  return {
    ...base,
    status: test.result === 'pass' ? (name ? 'Found, name differs' : 'Found') : 'Not found',
    tone: test.result === 'pass' ? (name ? 'warn' : 'ok') : 'danger',
    lines,
    note: 'Source: brokercheck.finra.org. The lookup screenshot is kept with the verification record and isn’t returned to the browser.',
  }
}

function aktaRow(checks: Check[], investorType: InvestorType | null): Row | null {
  const c = checks.find((x) => x.id === 'entity_corroboration')
  if (investorType !== 'entity' && !c) return null
  const base = { icon: <Building2 className="size-5" />, source: 'akta.pro', title: 'Entity corroboration' }
  const note = 'Corroboration only. Company data can’t establish that anyone is accredited.'
  if (!c) return { ...base, status: 'Not reported', tone: 'neutral', lines: ['No entity corroboration came back for this application.'], note }
  return {
    ...base,
    status: c.result === 'pass' ? 'Corroborated' : 'Not corroborated',
    tone: c.result === 'pass' ? 'ok' : 'warn',
    lines: [c.result === 'pass' ? 'Entity resolves to an operating business' : c.detail.replace(/\s*\(akta\.pro[^)]*\)\.?/, '.')],
    note,
  }
}

// The verification API doesn't return trace or debate-artifact metadata, so these say so plainly.
const prismRow: Row = {
  icon: <Waypoints className="size-5" />,
  source: 'PRISM',
  title: 'Trace & audit',
  status: 'Not reported',
  tone: 'neutral',
  lines: ['No trace reference came back with this verification.'],
}

const roundtableRow: Row = {
  icon: <ScrollText className="size-5" />,
  source: 'roundtable',
  title: 'Debate record',
  status: 'Not reported',
  tone: 'neutral',
  lines: ['The agents’ debate is stored with the verification record; no artifact link came back to the browser.'],
}

export function EvidencePanel({ checks, pathway, investorType, className }: { checks: Check[]; pathway: Pathway | null; investorType: InvestorType | null; className?: string }) {
  const rows = [documentRow(checks), brokerCheckRow(checks, pathway), aktaRow(checks, investorType), prismRow, roundtableRow].filter((r): r is Row => r !== null)
  return (
    <section className={className}>
      <h2 className="text-[16px] font-medium text-ink">How this was verified</h2>
      <ul className="mt-4 divide-y divide-line border border-line bg-raised">
        {rows.map((r) => (
          <li key={r.title} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,220px)_1fr_auto] sm:items-start sm:gap-6">
            <div className="flex items-center gap-3">
              <span className="text-accent">{r.icon}</span>
              <div>
                <p className="text-[15px] font-semibold text-ink">{r.title}</p>
                <p className="text-[13px] text-ink-3">{r.source}</p>
              </div>
            </div>
            <div className="space-y-1 text-[14px] leading-relaxed text-ink-2">
              {r.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
              {r.note && <p className="text-[13px] text-ink-3">{r.note}</p>}
            </div>
            <span className={cn('inline-flex h-7 items-center justify-self-start rounded-full px-3 text-[13px] font-semibold whitespace-nowrap sm:justify-self-end', TONE[r.tone])}>{r.status}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
