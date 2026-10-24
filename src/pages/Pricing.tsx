import { Check, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog } from 'radix-ui'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { Field, Input, Select } from '../components/ui/field'
import { api } from '../lib/api/client'
import { cn } from '../lib/cn'

const TIERS = [
  {
    id: 'investors',
    name: 'Investors',
    price: 'Free',
    unit: 'always',
    blurb: 'Get verified once and invest anywhere Savy is accepted.',
    features: ['Verify in about 10 minutes', 'Reusable passport for 90 days', 'Share with any fund in one click', 'Your documents never go to the fund'],
    cta: { label: 'Get verified', to: '/get-started' },
  },
  {
    id: 'funds',
    name: 'Funds',
    price: '$45',
    unit: 'per verification',
    blurb: 'Every LP verified, documented and filed before your first close.',
    features: ['Pay only when an LP is verified', 'Invite LPs by email or one link', 'Live dashboard and automatic reminders', 'Verification letter and audit file per LP', 'Savy Verification Guarantee', 'Carta, AngelList, Affinity and Juniper Square'],
    cta: { label: 'Start verifying', to: '/signin?as=issuer' },
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    unit: 'volume pricing',
    blurb: 'For fund administrators, platforms and multi-fund managers.',
    features: ['Volume pricing', 'API access and embedded verification', 'Custom onboarding and support', 'Everything in Funds'],
  },
] as const

export default function Pricing() {
  const [quote, setQuote] = useState(false)
  return (
    <div className="bg-surface">
      <div className="mx-auto max-w-6xl px-5 pt-16 pb-6 sm:px-8 sm:pt-20">
        <h1 className="display text-center text-[clamp(36px,5vw,54px)] leading-[1.06] text-ink">Simple pricing</h1>
        <p className="mt-3 text-center text-[18px] text-ink-2">Investors never pay. Funds pay per verified LP.</p>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {TIERS.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={cn('relative flex flex-col border bg-raised p-8 shadow-card', 'featured' in t && t.featured ? 'border-accent shadow-[0_0_0_1px_var(--accent)]' : 'border-line')}
            >
              {'featured' in t && t.featured && <span className="absolute -top-3 left-8 rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-on-accent">Most popular</span>}
              <h2 className="text-[20px] font-semibold text-ink">{t.name}</h2>
              <p className="mt-5 flex items-baseline gap-2">
                <span className="display text-[52px] leading-none text-ink">{t.price}</span>
                <span className="text-[16px] text-ink-3">{t.unit}</span>
              </p>
              <p className="mt-4 text-[16px] leading-relaxed text-ink-2">{t.blurb}</p>
              <ul className="mt-6 flex-1 space-y-3 border-t border-line pt-6">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-[15px] text-ink-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>
              {'cta' in t ? (
                <Link to={t.cta.to} className="mt-8">
                  <Button size="lg" variant={'featured' in t && t.featured ? 'primary' : 'secondary'} className="w-full">
                    {t.cta.label}
                  </Button>
                </Link>
              ) : (
                <Button size="lg" variant="secondary" className="mt-8 w-full" onClick={() => setQuote(true)}>
                  Get a quote
                </Button>
              )}
            </motion.div>
          ))}
        </div>
        <p className="mt-8 text-center text-[14px] text-ink-3">Prices in USD. Taxes may apply.</p>
      </div>
      <QuoteDialog open={quote} onOpenChange={setQuote} />
    </div>
  )
}

function QuoteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [f, setF] = useState({ name: '', email: '', company: '', volume: '100–500', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!f.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email) || !f.company.trim()) return setError('Add your name, work email and company.')
    setBusy(true)
    setError(null)
    try {
      await api.requestQuote({ name: f.name.trim(), email: f.email.trim(), company: f.company.trim(), volume: f.volume, notes: f.notes.trim() || undefined })
      toast.success('Thanks, we’ll be in touch', { description: 'Expect a reply within one business day.' })
      onOpenChange(false)
      setF({ name: '', email: '', company: '', volume: '100–500', notes: '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send your request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-ink/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.form
                onSubmit={submit}
                noValidate
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } }}
                className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-line bg-raised shadow-lift focus:outline-none"
              >
                <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
                  <Dialog.Title className="display text-[24px] text-ink">Get a quote</Dialog.Title>
                  <Dialog.Close className="-m-1.5 rounded-[4px] p-1.5 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label="Close">
                    <X className="size-5" />
                  </Dialog.Close>
                </div>
                <div className="grid gap-5 px-6 py-5">
                  <Field label="Name">
                    <Input autoFocus autoComplete="name" value={f.name} onChange={set('name')} />
                  </Field>
                  <Field label="Work email">
                    <Input type="email" autoComplete="email" value={f.email} onChange={set('email')} />
                  </Field>
                  <Field label="Company">
                    <Input autoComplete="organization" value={f.company} onChange={set('company')} />
                  </Field>
                  <Field label="Verifications per year">
                    <Select value={f.volume} onChange={set('volume')}>
                      {['Under 100', '100–500', '500–2,000', '2,000–10,000', '10,000+'].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Anything else" optional>
                    <textarea
                      rows={3}
                      value={f.notes}
                      onChange={set('notes')}
                      className="w-full rounded-[4px] border border-line-strong bg-raised px-3.5 py-3 text-[16px] text-ink focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
                    />
                  </Field>
                  {error && (
                    <p className="text-[15px] text-danger" role="alert">
                      {error}
                    </p>
                  )}
                  <Button type="submit" size="lg" loading={busy}>
                    Request a quote
                  </Button>
                </div>
              </motion.form>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
