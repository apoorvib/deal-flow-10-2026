import { FlaskConical } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { api, isMock } from '../../lib/api/client'
import { cn } from '../../lib/cn'
import { shortDate } from '../../lib/format'
import type { Integration, IntegrationId } from '../../lib/types'
import { Skeleton } from '../../components/ui/skeleton'
import { Notice, actionError } from '../../components/ui/notice'

export const PLATFORMS: Record<IntegrationId, { name: string; logo: string; job: string }> = {
  carta: { name: 'Carta', logo: '/img/platforms/carta.png', job: 'Cap tables & fund admin' },
  angellist: { name: 'AngelList', logo: '/img/platforms/angellist.png', job: 'SPVs & syndicates' },
  affinity: { name: 'Affinity', logo: '/img/platforms/affinity.png', job: 'Dealflow CRM' },
  junipersquare: { name: 'Juniper Square', logo: '/img/platforms/junipersquare.png', job: 'LP portal & fund admin' },
}

function useIntegrations() {
  const [list, setList] = useState<Integration[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    api.listIntegrations().then(setList, setError)
  }, [])
  const replace = (next: Integration) => setList((xs) => xs?.map((x) => (x.id === next.id ? next : x)) ?? xs)
  return { list, replace, error }
}

/** Full manager, for Settings: connect, disconnect, and choose what syncs. */
export function IntegrationsManager() {
  const { list, replace, error } = useIntegrations()
  const [busy, setBusy] = useState<IntegrationId | null>(null)
  if (error) return <Notice error={error} what="Platform integrations" />
  if (!list)
    return (
      <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="size-9 rounded-[8px]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        ))}
      </div>
    )

  const run = async (iid: IntegrationId, fn: () => Promise<Integration>, message?: string) => {
    setBusy(iid)
    try {
      replace(await fn())
      if (message) toast.success(message)
    } catch (e) {
      toast.error('Couldn’t update the integration', { description: actionError(e, 'Try again in a moment.') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {list.map((x) => {
          const p = PLATFORMS[x.id]
          return (
            <li key={x.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-center gap-4">
                <img src={p.logo} alt="" width={36} height={36} className="size-9 rounded-[8px]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold text-ink">{p.name}</p>
                  <p className="text-[14px] text-ink-3">{x.connected ? `Connected ${x.connectedAt ? shortDate(x.connectedAt) : ''}` : p.job}</p>
                </div>
                {x.connected ? (
                  <Button variant="ghost" size="sm" loading={busy === x.id} onClick={() => run(x.id, () => api.disconnectIntegration(x.id), `${p.name} disconnected`)}>
                    Disconnect
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" loading={busy === x.id} onClick={() => run(x.id, () => api.connectIntegration(x.id), `${p.name} connected`)}>
                    Connect
                  </Button>
                )}
              </div>
              {x.connected && (
                <div className="mt-3 ml-13 grid gap-2">
                  <Sync label={`Send cleared LPs to ${p.name}`} on={x.pushCleared} onChange={(v) => run(x.id, () => api.updateIntegration(x.id, { pushCleared: v }))} />
                  <Sync label={`Invite LPs from ${p.name}`} on={x.importContacts} onChange={(v) => run(x.id, () => api.updateIntegration(x.id, { importContacts: v }))} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {isMock && (
        <p className="mt-4 flex items-start gap-1.5 text-[13px] text-ink-3">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0" /> Sandbox: connections are simulated. No data leaves Savy.
        </p>
      )}
    </div>
  )
}

function Sync({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-[15px] text-ink-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-accent' : 'bg-line-strong/60')}
      >
        <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200', on && 'translate-x-4')} />
      </button>
      {label}
    </label>
  )
}

/** Compact row for the fund dashboard. */
export function IntegrationsRow() {
  const { list, error } = useIntegrations()
  // The dashboard row is a shortcut; if the backend has no integrations yet, leave it out.
  if (error) return null
  if (!list) return <Skeleton className="mt-5 h-[58px]" />
  const connected = list.filter((x) => x.connected)
  return (
    <section className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-line bg-raised px-6 py-4 shadow-card">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="text-[15px] font-semibold text-ink">Platforms</span>
        {list.map((x) => (
          <span key={x.id} className={cn('flex items-center gap-2 text-[15px]', x.connected ? 'text-ink' : 'text-ink-3')}>
            <img src={PLATFORMS[x.id].logo} alt="" width={22} height={22} className={cn('size-[22px] rounded-[5px]', !x.connected && 'opacity-40 grayscale')} />
            {PLATFORMS[x.id].name}
            {x.connected && <span className="size-1.5 rounded-full bg-ok" aria-label="connected" />}
          </span>
        ))}
      </div>
      <Link to="/settings#integrations" className="link text-[15px] font-semibold">
        {connected.length ? 'Manage' : 'Connect'}
      </Link>
    </section>
  )
}
