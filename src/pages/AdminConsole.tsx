import { ArrowRight, ArrowUpRight, Briefcase, CircleAlert, CircleCheck, CircleX, Clock, Globe, RotateCcw, User } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { api, isMock } from '../lib/api/client'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/cn'
import type { AdminView, Decision } from '../lib/types'

/** Showcase console: switch personas and jump to any screen in one click. */
export default function AdminConsole() {
  const { admin, loading, switchTo, refresh } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)

  // Arriving here returns the admin to their own view, once. Later persona switches from this page
  // update `admin` just before navigating away, and must not be undone.
  const arrived = useRef(false)
  useEffect(() => {
    if (!admin || arrived.current) return
    arrived.current = true
    if (admin.viewingAs !== 'admin') switchTo('admin')
  }, [admin, switchTo])

  if (loading) return null
  if (!admin) return isMock ? <EnterShowcase /> : <Navigate to="/signin?as=admin&next=/admin" replace />

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }
  const viewAs = (as: AdminView, path?: string) =>
    run(`as-${as}-${path ?? ''}`, async () => {
      const home = await switchTo(as)
      navigate(path ?? home)
    })
  const outcome = (d: Decision) =>
    run(`case-${d}`, async () => {
      await switchTo('visitor')
      const v = await api.adminCreateCase(d)
      navigate(`/status/${v.id}`)
    })

  const pid = admin.investor.passportId

  return (
    <div className="min-h-[70vh] bg-surface">
      <div className="mx-auto max-w-6xl px-5 pt-10 pb-6 sm:px-8 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Admin</p>
            <h1 className="display mt-2 text-[clamp(30px,4vw,40px)] text-ink">Showcase console</h1>
            <p className="mt-1 text-[16px] text-ink-3">Signed in as {admin.admin.email}. Switch views anytime from the bar at the bottom of the screen.</p>
          </div>
          <Button
            variant="secondary"
            loading={busy === 'reset'}
            onClick={() =>
              run('reset', async () => {
                await api.adminReset()
                await refresh()
                toast.success('Demo data reset')
              })
            }
          >
            <RotateCcw className="size-4" /> Reset demo data
          </Button>
        </div>

        {/* Personas */}
        <h2 className="mt-10 text-[20px] font-semibold text-ink">View as</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Persona icon={<User className="size-5" />} title={admin.investor.name} role="Investor" detail="Verified passport, 3 investments, shared with Meridian" onClick={() => viewAs('investor')} busy={busy?.startsWith('as-investor')} />
          <Persona icon={<Briefcase className="size-5" />} title={admin.issuer.name} role="Fund" detail="Meridian Seed Fund II pipeline, 12 investors" onClick={() => viewAs('issuer')} busy={busy?.startsWith('as-issuer')} />
          <Persona icon={<Globe className="size-5" />} title="New visitor" role="Signed out" detail="The public site and the verification flow" onClick={() => viewAs('visitor')} busy={busy?.startsWith('as-visitor')} />
        </div>

        {/* Screens */}
        <h2 className="mt-12 text-[20px] font-semibold text-ink">Jump to a screen</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Group title="Marketing" note="As a visitor">
            <Jump label="Home" path="/" onClick={() => viewAs('visitor', '/')} />
            <Jump label="Get verified" path="/get-started" onClick={() => viewAs('visitor', '/get-started')} />
            <Jump label="Sign in" path="/signin" onClick={() => viewAs('visitor', '/signin')} />
            <Jump label="Find a passport" path="/find" onClick={() => viewAs('visitor', '/find')} />
          </Group>
          <Group title="Verification flow" note="As a visitor">
            <Jump label="1 · Details" path="/verify" onClick={() => viewAs('visitor', '/verify?step=profile&type=individual')} />
            <Jump label="2 · Identity" path="/verify" onClick={() => viewAs('visitor', '/verify?step=identity&type=individual')} />
            <Jump label="3 · Qualify" path="/verify" onClick={() => viewAs('visitor', '/verify?step=qualify&type=individual')} />
            <Jump label="4 · Submit" path="/verify" onClick={() => viewAs('visitor', '/verify?step=sign&type=individual')} />
          </Group>
          <Group title="Outcomes" note="Creates a fresh demo case">
            <Jump label="Verified" icon={<CircleCheck className="size-4 text-ok" />} path="/status" onClick={() => outcome('approved')} busy={busy === 'case-approved'} />
            <Jump label="Under review" icon={<Clock className="size-4 text-warn" />} path="/status" onClick={() => outcome('review')} busy={busy === 'case-review'} />
            <Jump label="Needs info" icon={<CircleAlert className="size-4 text-warn" />} path="/status" onClick={() => outcome('needs_info')} busy={busy === 'case-needs_info'} />
            <Jump label="Not verified" icon={<CircleX className="size-4 text-danger" />} path="/status" onClick={() => outcome('denied')} busy={busy === 'case-denied'} />
          </Group>
          <Group title="Signed in" note="Switches persona first">
            <Jump label="Investor dashboard" path="/dashboard" onClick={() => viewAs('investor', '/dashboard')} />
            <Jump label="Passport" path="/passport" onClick={() => viewAs('investor', pid ? `/passport/${pid}` : '/dashboard')} />
            <Jump label="Share with funds" path="/passport/deals" onClick={() => viewAs('investor', pid ? `/passport/${pid}/deals` : '/dashboard')} />
            <Jump label="Fund dashboard" path="/fund" onClick={() => viewAs('issuer', '/fund')} />
          </Group>
        </div>
        <p className="mt-8 text-[14px] text-ink-3">Sandbox only. On a real backend these admin endpoints must be limited to staff accounts.</p>
      </div>
    </div>
  )
}

function Persona({ icon, title, role, detail, onClick, busy }: { icon: ReactNode; title: string; role: string; detail: string; onClick: () => void; busy?: boolean }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -2 }}
      className="group flex flex-col items-start gap-3 border border-line bg-raised p-6 text-left shadow-card transition-colors hover:border-accent"
    >
      <span className="grid size-10 place-items-center rounded-full bg-accent/10 text-accent">{icon}</span>
      <span>
        <span className="block text-[13px] font-semibold tracking-wide text-ink-3 uppercase">{role}</span>
        <span className="mt-0.5 block text-[19px] font-semibold text-ink">{title}</span>
        <span className="mt-1 block text-[15px] text-ink-2">{detail}</span>
      </span>
      <span className="mt-auto inline-flex items-center gap-1 text-[15px] font-semibold text-link">
        {busy ? 'Switching…' : 'View as'} <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
    </motion.button>
  )
}

function Group({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="border border-line bg-raised shadow-card">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-3.5">
        <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
        <span className="text-[13px] text-ink-3">{note}</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-line">{children}</div>
    </section>
  )
}

function Jump({ label, path, onClick, icon, busy }: { label: string; path: string; onClick: () => void; icon?: ReactNode; busy?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className={cn('group flex items-center justify-between gap-3 bg-raised px-5 py-4 text-left transition-colors hover:bg-surface', busy && 'opacity-60')}>
      <span>
        <span className="flex items-center gap-2 text-[16px] text-ink">
          {icon}
          {label}
        </span>
        <span className="font-mono text-[12px] text-ink-3">{path}</span>
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-ink-3 transition-colors group-hover:text-accent" />
    </button>
  )
}

/** Sandbox shortcut: one click signs in a demo admin, no email step. */
function EnterShowcase() {
  const { refresh } = useAuth()
  const [busy, setBusy] = useState(false)
  const enter = async () => {
    setBusy(true)
    try {
      await api.signIn('demo@savy.probe.invalid', 'demo', 'admin')
      await refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="bg-surface">
      <div className="mx-auto max-w-[460px] px-5 pt-20 pb-24 text-center sm:px-8">
        <div className="border border-line bg-raised p-10 shadow-card">
          <p className="eyebrow">Admin</p>
          <h1 className="display mt-2 text-[34px] text-ink">Showcase console</h1>
          <p className="mt-2 text-[16px] text-ink-2">Switch between investor, fund and visitor views in one click.</p>
          <Button size="lg" className="mt-7 w-full" onClick={enter} loading={busy}>
            Enter showcase <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
