import { Mail, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { api } from '../lib/api/client'
import { cn } from '../lib/cn'
import { setSession } from '../lib/session'

export default function FindPassport() {
  return (
    <div className="bg-surface">
      <div className="mx-auto max-w-[1040px] px-5 pt-14 pb-6 sm:px-8">
        <h1 className="display text-[clamp(32px,4vw,44px)] text-ink">Open your passport</h1>
        <p className="mt-2 text-[17px] text-ink-2">Enter the email you verified with and the reference from your letter.</p>
      </div>
      <FindPassportBar />
    </div>
  )
}

function FindPassportBar() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !ref.trim()) return setError('Enter your email and letter reference.')
    setBusy(true)
    setError(null)
    try {
      const r = await api.findPassport(email, ref)
      if (!r) return setError('We couldn’t find a passport with those details.')
      setSession({ passportId: r.passportId })
      navigate(`/passport/${r.passportId}`)
    } finally {
      setBusy(false)
    }
  }

  const input =
    'h-12 w-full rounded-[4px] border border-line-strong bg-raised pl-11 pr-3 text-[16px] text-ink placeholder:text-ink-3/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25'

  return (
    <section className="pb-16">
      <form onSubmit={submit} className="mx-auto grid max-w-[1040px] gap-x-8 gap-y-4 px-5 py-8 sm:px-8 md:grid-cols-[1fr_1fr_220px]" noValidate>
        <div>
          <label htmlFor="find-email" className="text-[16px] text-ink">
            Email
          </label>
          <div className="relative mt-1.5">
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-2" strokeWidth={1.5} />
            <input id="find-email" type="email" autoComplete="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <p className="mt-2 text-[15px] text-ink-2">Use the email from your verification.</p>
        </div>
        <div>
          <label htmlFor="find-ref" className="text-[16px] text-ink">
            Letter reference
          </label>
          <div className="relative mt-1.5">
            <ShieldCheck className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-2" strokeWidth={1.5} />
            <input id="find-ref" autoComplete="off" placeholder="AIV-2026-XXXXXX" className={cn(input, 'font-mono text-[15px] uppercase placeholder:normal-case')} value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          {error ? (
            <p className="mt-2 text-[15px] text-danger" role="alert">
              {error}
            </p>
          ) : (
            <p className="mt-2 text-[15px] text-ink-3">It&rsquo;s in your verification letter email.</p>
          )}
        </div>
        <div className="md:pt-[30px]">
          <Button type="submit" size="lg" loading={busy} className="h-12 w-full text-[18px]">
            Open passport
          </Button>
          <Link to="/get-started" className="link mt-2.5 inline-block text-[15px]">
            New here? Get started
          </Link>
        </div>
      </form>
    </section>
  )
}

