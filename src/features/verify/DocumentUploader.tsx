import { AlertTriangle, FileText, Sparkles, Upload, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../lib/api/client'
import { cn } from '../../lib/cn'
import { shortDate, usd } from '../../lib/format'
import type { DocType, ParsedDocument } from '../../lib/types'
import { useDraft } from './draft'

const DOC_LABEL: Record<DocType, string> = {
  w2: 'Form W-2',
  form_1040: 'Form 1040',
  k1: 'Schedule K-1',
  bank_statement: 'Bank statement',
  brokerage_statement: 'Brokerage statement',
  cpa_letter: 'CPA letter',
  trust_agreement: 'Trust agreement',
  entity_formation: 'Formation documents',
  other: 'Unrecognized document',
}

interface Pending {
  key: string
  name: string
}

export function DocumentUploader({ title, hint }: { title: string; hint: string }) {
  const { draft, dispatch } = useDraft()
  const [pending, setPending] = useState<Pending[]>([])
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const holder = draft.investorType === 'entity' ? draft.profile.entityName ?? '' : draft.profile.legalName

  const handle = (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (!/pdf|image\//.test(file.type)) {
        toast.error(`${file.name} isn’t supported`, { description: 'Upload a PDF, PNG, or JPG.' })
        continue
      }
      const key = crypto.randomUUID()
      setPending((p) => [...p, { key, name: file.name }])
      api
        .uploadDocument(file, holder)
        .then((doc) => dispatch({ type: 'addDoc', doc }))
        .catch((e) => toast.error(`Couldn’t read ${file.name}`, { description: e instanceof Error ? e.message : undefined }))
        .finally(() => setPending((p) => p.filter((x) => x.key !== key)))
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[16px] font-medium text-ink">{title}</h3>
        <span className="flex items-center gap-1 text-[12px] text-ink-3">
          <Sparkles className="size-3 text-brass" /> Read automatically
        </span>
      </div>

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          handle(e.dataTransfer.files)
        }}
        className={cn(
          'group flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-[border-color,background-color] duration-200',
          over ? 'border-accent bg-accent/[0.04]' : 'border-line-strong bg-raised hover:border-ink-3',
        )}
      >
        <span className="grid size-10 place-items-center rounded-full border border-line bg-surface text-ink-2 transition-transform duration-200 group-hover:-translate-y-0.5">
          <Upload className="size-4" />
        </span>
        <span className="text-[15px] text-ink">
          <span className="font-medium">Choose files</span> <span className="text-ink-2">or drag them here</span>
        </span>
        <span className="text-[14px] text-ink-3">{hint}</span>
      </button>
      <input ref={input} type="file" multiple accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => (handle(e.target.files), (e.target.value = ''))} />

      <ul className="grid gap-2">
        <AnimatePresence initial={false}>
          {pending.map((p) => (
            <motion.li key={p.key} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative overflow-hidden rounded-xl border border-line bg-raised px-4 py-3.5">
              <div className="flex items-center gap-3">
                <FileText className="size-4 shrink-0 text-ink-3" />
                <span className="truncate text-[15px] text-ink">{p.name}</span>
                <span className="ml-auto shrink-0 text-[14px] text-ink-3">Reading</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-2 rounded-full bg-line" />
                ))}
              </div>
              <motion.div
                className="pointer-events-none absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--brass)_14%,transparent),transparent)]"
                animate={{ left: ['-33%', '100%'] }}
                transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.li>
          ))}
          {draft.documents.map((d) => (
            <motion.li key={d.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginTop: -8 }}>
              <ParsedRow doc={d} onRemove={() => dispatch({ type: 'removeDoc', id: d.id })} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}

function ParsedRow({ doc, onRemove }: { doc: ParsedDocument; onRemove: () => void }) {
  const figure = doc.income != null ? { k: doc.taxYear ? `${doc.taxYear} income` : 'Income', v: usd(doc.income) } : doc.balance != null ? { k: 'Balance', v: usd(doc.balance) } : null
  const pct = Math.round(doc.confidence * 100)
  const weak = doc.confidence < 0.8 || doc.flags.length > 0
  return (
    <div className={cn('rounded-xl border bg-raised px-4 py-3.5', weak ? 'border-warn/40' : 'border-line')}>
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 size-4 shrink-0 text-ink-2" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[15px] font-medium text-ink">{DOC_LABEL[doc.docType]}</span>
            <span className="truncate text-[14px] text-ink-3">{doc.fileName}</span>
          </div>
          <dl className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {figure && <Pair k={figure.k} v={figure.v} />}
            {doc.statementDate && <Pair k="Dated" v={shortDate(doc.statementDate)} />}
            {doc.holderName && <Pair k="Holder" v={doc.holderName} />}
            <div>
              <dt className="text-[11px] tracking-wide text-ink-3 uppercase">Confidence</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="h-1 w-12 overflow-hidden rounded-full bg-line">
                  <motion.span className={cn('block h-full rounded-full', weak ? 'bg-warn' : 'bg-ok')} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, delay: 0.1 }} />
                </span>
                <span className="tnum font-mono text-[12px] text-ink-2">{pct}%</span>
              </dd>
            </div>
          </dl>
          {doc.flags.length > 0 && (
            <p className="mt-2.5 flex items-start gap-1.5 text-[14px] text-warn">
              <AlertTriangle className="mt-px size-3.5 shrink-0" /> {doc.flags.join(' · ')}. A reviewer will look at this.
            </p>
          )}
        </div>
        <button type="button" onClick={onRemove} className="-m-1 rounded-md p-1 text-ink-3 transition-colors hover:bg-ink/5 hover:text-ink" aria-label={`Remove ${doc.fileName}`}>
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] tracking-wide text-ink-3 uppercase">{k}</dt>
      <dd className="tnum mt-0.5 truncate font-mono text-[14px] text-ink">{v}</dd>
    </div>
  )
}
