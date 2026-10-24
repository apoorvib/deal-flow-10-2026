import { Briefcase, FlaskConical, MailCheck, ShieldUser, User } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/field'
import { api, isMock } from '../lib/api/client'
import { homeFor, useAuth } from '../lib/auth'
import { cn } from '../lib/cn'
import type { Role } from '../lib/types'
import { Photo } from '../components/Photo'

const ROLES: { id: Role; label: string; icon: typeof User }[] = [
  { id: 'investor', label: 'Investor', icon: User },
  { id: 'issuer', label: 'Fund', icon: Briefcase },
]

export default function SignIn() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const asParam = params.get('as')
  const [role, setRole] = useState<Role>(asParam === 'issuer' || asParam === 'admin' ? asParam : 'investor')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ devToken?: string } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email.')
    setError(null)
    setBusy(true)
    try {
      setSent(await api.requestSignIn(email, role))
    } finally {
      setBusy(false)
    }
  }

  // Sandbox stand-in for clicking the link in the email.
  const follow = async (token: string) => {
    setBusy(true)
    try {
      const user = await api.completeSignIn(token)
      await refresh()
      const next = params.get('next')
      navigate(next && next.startsWith('/') ? next : homeFor(user.role), { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid bg-surface lg:min-h-[640px] lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <Photo name="img01" sizes="50vw" className="absolute inset-0 size-full" position="30% center" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#022a21]/70 via-transparent to-transparent" aria-hidden />
        <p className="display absolute right-10 bottom-10 left-10 text-[32px] leading-tight text-white">Accredited, once. Invested, everywhere.</p>
      </div>
      <div className="mx-auto w-full max-w-[460px] self-center px-5 pt-16 pb-20 sm:px-8">
        <div className="border border-line bg-raised p-8 shadow-card sm:p-10">
          <AnimatePresence mode="wait" initial={false}>
            {sent ? (
              <motion.div key="sent" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-ok-soft text-ok">
                  <MailCheck className="size-6" strokeWidth={1.75} />
                </span>
                <h1 className="display mt-5 text-[32px] text-ink">Check your email</h1>
                <p className="mt-2 text-[16px] text-ink-2">
                  We sent a sign-in link to <span className="font-semibold text-ink">{email}</span>.
                </p>
                {isMock && sent.devToken && (
                  <div className="mt-7 rounded-[6px] border border-dashed border-line-strong p-4">
                    <p className="flex items-center justify-center gap-1.5 text-[12px] font-semibold tracking-[0.12em] text-ink-3 uppercase">
                      <FlaskConical className="size-3.5" /> Sandbox
                    </p>
                    <Button className="mt-3 w-full" onClick={() => follow(sent.devToken!)} loading={busy}>
                      Open sign-in link
                    </Button>
                  </div>
                )}
                <button type="button" className="link mt-6 text-[15px] font-semibold" onClick={() => setSent(null)}>
                  Use a different email
                </button>
              </motion.div>
            ) : (
              <motion.form key="form" onSubmit={submit} noValidate initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <h1 className="display text-[34px] text-ink">Sign in</h1>
                <div role="radiogroup" aria-label="Account type" className={cn('mt-6 grid gap-2', asParam === 'admin' ? 'grid-cols-3' : 'grid-cols-2')}>
                  {(asParam === 'admin' ? [...ROLES, { id: 'admin' as Role, label: 'Admin', icon: ShieldUser }] : ROLES).map((r) => {
                    const on = r.id === role
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setRole(r.id)}
                        className={cn(
                          'flex h-12 items-center justify-center gap-2 rounded-[4px] border text-[16px] transition-[border-color,box-shadow]',
                          on ? 'border-accent text-ink shadow-[0_0_0_1px_var(--accent)]' : 'border-line-strong text-ink-2 hover:border-ink-2',
                        )}
                      >
                        <r.icon className={cn('size-4', on ? 'text-accent' : 'text-ink-3')} strokeWidth={1.75} />
                        {r.label}
                      </button>
                    )
                  })}
                </div>
                <Field label="Email" className="mt-6" error={error}>
                  <Input type="email" autoComplete="email" inputMode="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error || undefined} />
                </Field>
                <Button type="submit" size="lg" className="mt-6 w-full" loading={busy}>
                  Email me a sign-in link
                </Button>
                <p className="mt-6 text-center text-[15px] text-ink-3">
                  New to Savy?{' '}
                  <Link to="/get-started" className="link font-semibold">
                    Get verified
                  </Link>
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
