import { Bell, KeyRound, Lock, UserRound } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { Field, Input } from '../components/ui/field'
import { api } from '../lib/api/client'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/cn'
import type { Role, UserSettings } from '../lib/types'

/** Which notification switches each account type gets. Keys match the backend's notification settings. */
export const SETTINGS_NOTIFICATIONS: Record<Role, { key: string; label: string; hint: string }[]> = {
  investor: [
    { key: 'passportExpiry', label: 'Passport expiry', hint: 'A reminder 14 days before your passport runs out' },
    { key: 'fundRequests', label: 'Fund requests', hint: 'When a fund invites you to verify or share' },
    { key: 'productUpdates', label: 'Product updates', hint: 'Occasional news about Savy' },
  ],
  issuer: [
    { key: 'lpCleared', label: 'LP cleared', hint: 'Each time an investor in your raise is verified' },
    { key: 'weeklyDigest', label: 'Weekly digest', hint: 'Cleared, pending and expired investors every Monday' },
    { key: 'autoNudge', label: 'Automatic reminders', hint: 'We nudge investors who haven’t finished, so you don’t have to' },
  ],
  admin: [{ key: 'productUpdates', label: 'Product updates', hint: 'Occasional news about Savy' }],
}

export default function Settings() {
  const { user, loading, refresh } = useAuth()
  const [s, setS] = useState<UserSettings | null>(null)
  const [name, setName] = useState('')

  useEffect(() => {
    if (!user) return
    api.getSettings().then((x) => {
      setS(x)
      setName(x.name)
    })
  }, [user])

  if (loading) return null
  if (!user) return <Navigate to="/signin?next=/settings" replace />

  const update = async (patch: Partial<Omit<UserSettings, 'email'>>, message = 'Saved') => {
    const next = await api.updateSettings(patch)
    setS(next)
    toast.success(message)
  }

  return (
    <div className="min-h-[70vh] bg-surface">
      <div className="mx-auto max-w-3xl px-5 pt-10 pb-6 sm:px-8 sm:pt-12">
        <h1 className="display text-[clamp(30px,4vw,40px)] text-ink">Settings</h1>

        {!s ? (
          <div className="mt-8 space-y-5">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse bg-line" />)}</div>
        ) : (
          <div className="mt-8 grid gap-5">
            <Section icon={<UserRound className="size-5" />} title="Profile">
              <form
                className="grid gap-5"
                onSubmit={(e) => {
                  e.preventDefault()
                  update({ name }, 'Profile saved').then(refresh)
                }}
              >
                <Field label={user.role === 'issuer' ? 'Firm name' : 'Name'}>
                  <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </Field>
                <Field label="Email" hint="Contact support to change the email on your account">
                  <Input value={s.email} readOnly className="bg-surface text-ink-3" />
                </Field>
                <div>
                  <Button type="submit" disabled={!name.trim() || name.trim() === s.name}>
                    Save profile
                  </Button>
                </div>
              </form>
            </Section>

            <Section icon={<KeyRound className="size-5" />} title="Password">
              <PasswordForm />
            </Section>

            <Section icon={<Bell className="size-5" />} title="Email notifications">
              <ul className="divide-y divide-line">
                {SETTINGS_NOTIFICATIONS[user.role].map((n) => (
                  <Toggle
                    key={n.key}
                    label={n.label}
                    hint={n.hint}
                    on={!!s.notifications[n.key]}
                    onChange={(v) => update({ notifications: { ...s.notifications, [n.key]: v } })}
                  />
                ))}
              </ul>
            </Section>

            {user.role === 'investor' && (
              <Section icon={<Lock className="size-5" />} title="Privacy">
                <ul className="divide-y divide-line">
                  <Toggle
                    label="Share automatically when a fund invites me"
                    hint="If your passport is valid, following a fund's invite shares it straight away. Turn off to be asked each time."
                    on={s.autoShareOnInvite}
                    onChange={(v) => update({ autoShareOnInvite: v })}
                  />
                </ul>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      toast.success('Password updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t update your password.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
      <Field label="Current password">
        <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="New password" hint="At least 8 characters" error={error}>
        <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={!!error || undefined} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy} disabled={!current || !next}>
          Update password
        </Button>
      </div>
    </form>
  )
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="border border-line bg-raised shadow-card">
      <h2 className="flex items-center gap-2.5 border-b border-line px-6 py-4 text-[18px] font-semibold text-ink">
        <span className="text-accent">{icon}</span>
        {title}
      </h2>
      <div className="px-6 py-5">{children}</div>
    </section>
  )
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <li className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <div>
        <p className="text-[16px] text-ink">{label}</p>
        <p className="mt-0.5 text-[14px] text-ink-3">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={cn('relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-line-strong/60')}
      >
        <span className={cn('absolute top-1 left-1 size-5 rounded-full bg-white shadow-sm transition-transform duration-200', on && 'translate-x-5')} />
      </button>
    </li>
  )
}
