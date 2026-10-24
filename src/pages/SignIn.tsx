import { Briefcase, Eye, EyeOff, ShieldUser, User } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Photo } from '../components/Photo'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/field'
import { api, isMock } from '../lib/api/client'
import { homeFor, useAuth } from '../lib/auth'
import { cn } from '../lib/cn'
import type { Role } from '../lib/types'

const ROLES: { id: Role; label: string; icon: typeof User }[] = [
  { id: 'investor', label: 'Investor', icon: User },
  { id: 'issuer', label: 'Fund', icon: Briefcase },
]

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export default function SignIn() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const asParam = params.get('as')
  const [role, setRole] = useState<Role>(asParam === 'issuer' || asParam === 'admin' ? asParam : 'investor')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ field: 'email' | 'password' | 'form'; message: string } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!emailOk(email)) return setError({ field: 'email', message: 'Enter a valid email.' })
    if (!password) return setError({ field: 'password', message: 'Enter your password.' })
    setError(null)
    setBusy(true)
    try {
      const user = await api.signIn(email, password, role)
      await refresh()
      const next = params.get('next')
      navigate(next && next.startsWith('/') ? next : homeFor(user.role), { replace: true })
    } catch (err) {
      setError({ field: 'form', message: err instanceof Error ? err.message : 'Couldn’t sign in. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const roles = asParam === 'admin' ? [...ROLES, { id: 'admin' as Role, label: 'Admin', icon: ShieldUser }] : ROLES

  return (
    <div className="grid bg-surface lg:min-h-[640px] lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <Photo name="img01" sizes="50vw" className="absolute inset-0 size-full" position="30% center" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#022a21]/70 via-transparent to-transparent" aria-hidden />
        <p className="display absolute right-10 bottom-10 left-10 text-[32px] leading-tight text-white">Accredited, once. Invested, everywhere.</p>
      </div>
      <div className="mx-auto w-full max-w-[460px] self-center px-5 pt-16 pb-20 sm:px-8">
        <form onSubmit={submit} noValidate className="border border-line bg-raised p-8 shadow-card sm:p-10">
          <h1 className="display text-[34px] text-ink">Sign in</h1>

          <div role="radiogroup" aria-label="Account type" className={cn('mt-6 grid gap-2', roles.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {roles.map((r) => {
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

          <Field label="Email" className="mt-6" error={error?.field === 'email' ? error.message : null}>
            <Input type="email" autoComplete="email" inputMode="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error?.field === 'email' || undefined} />
          </Field>

          <Field label="Password" className="mt-5" error={error?.field === 'password' ? error.message : null} hint={isMock ? 'Demo: any password works' : undefined}>
            <div className="relative">
              <Input
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error?.field === 'password' || undefined}
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-[4px] text-ink-3 hover:bg-ink/5 hover:text-ink"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>

          {error?.field === 'form' && (
            <p className="mt-4 text-[15px] text-danger" role="alert">
              {error.message}
            </p>
          )}

          <Button type="submit" size="lg" className="mt-6 w-full" loading={busy}>
            Sign in
          </Button>
          <p className="mt-6 text-center text-[15px] text-ink-3">
            New to Savy?{' '}
            <Link to="/get-started" className="link font-semibold">
              Get verified
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
