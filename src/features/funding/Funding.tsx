import { Building2, Check, FlaskConical, Landmark, Loader2, Plus, Search, Send, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/field'
import { api, isMock } from '../../lib/api/client'
import { cn } from '../../lib/cn'
import { usd } from '../../lib/format'
import type { FundingAccount, Investment } from '../../lib/types'
import { actionError } from '../../components/ui/notice'

const INSTITUTIONS = ['Chase', 'Bank of America', 'Wells Fargo', 'Citi', 'J.P. Morgan Private Bank', 'Morgan Stanley', 'Charles Schwab', 'Fidelity', 'First Republic', 'SVB']

/** Shared modal chrome for the funding dialogs. */
function Modal({ open, onOpenChange, title, children, locked }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; locked?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !locked && onOpenChange(o)}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-ink/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } }}
                className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-line bg-raised shadow-lift focus:outline-none"
              >
                <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
                  <Dialog.Title className="display text-[24px] text-ink">{title}</Dialog.Title>
                  <Dialog.Close className="-m-1.5 rounded-[4px] p-1.5 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label="Close">
                    <X className="size-5" />
                  </Dialog.Close>
                </div>
                <div className="px-6 py-5">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

const SandboxNote = ({ children }: { children: ReactNode }) =>
  isMock ? (
    <p className="mt-4 flex items-start gap-1.5 text-[13px] text-ink-3">
      <FlaskConical className="mt-0.5 size-3.5 shrink-0" /> {children}
    </p>
  ) : null

/** Investor's funding accounts: the banks they send capital from. */
export function FundingAccounts({ accounts, onChange }: { accounts: FundingAccount[]; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const connect = async (inst: string) => {
    setBusy(inst)
    try {
      await api.connectFundingAccount(inst)
      toast.success(`${inst} connected`)
      setOpen(false)
      onChange()
    } catch (e) {
      toast.error('Couldn’t connect that bank', { description: actionError(e, 'Try again in a moment.') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="border border-line bg-raised shadow-card">
      <div className="flex items-center justify-between px-6 py-5">
        <h2 className="text-[20px] font-semibold text-ink">Funding accounts</h2>
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Connect bank
        </Button>
      </div>
      {accounts.length === 0 ? (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-4 border-t border-line px-6 py-6 text-left transition-colors hover:bg-surface">
          <span className="grid size-10 place-items-center rounded-[6px] bg-accent text-on-accent">
            <Landmark className="size-5" />
          </span>
          <span>
            <span className="block text-[16px] font-semibold text-ink">Connect the bank you invest from</span>
            <span className="block text-[14px] text-ink-3">Fund commitments in one click when a capital call comes in.</span>
          </span>
        </button>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-4 px-6 py-4">
              <span className="grid size-10 place-items-center rounded-[6px] border border-line bg-surface text-ink-2">
                <Building2 className="size-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] text-ink">
                  {a.institution} {a.name} •••• {a.last4}
                </p>
                <p className="text-[14px] text-ink-3">{a.isDefault ? 'Default for funding' : 'Connected'}</p>
              </div>
              <button
                type="button"
                onClick={() => api.removeFundingAccount(a.id).then(onChange, (e) => toast.error('Couldn’t remove the account', { description: actionError(e, 'Try again.') }))}
                className="rounded-[4px] p-2 text-ink-3 transition-colors hover:bg-ink/5 hover:text-danger"
                aria-label={`Remove ${a.institution} •••• ${a.last4}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onOpenChange={setOpen} title="Connect your bank" locked={!!busy}>
        <p className="text-[15px] text-ink-2">Sign in on your bank&rsquo;s own page. We never see your password.</p>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
          <Input autoFocus placeholder="Search banks" className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ul className="-mx-2 mt-3 max-h-72 overflow-y-auto">
          {INSTITUTIONS.filter((i) => i.toLowerCase().includes(q.toLowerCase())).map((inst) => (
            <li key={inst}>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => connect(inst)}
                className="flex w-full items-center gap-3 rounded-[4px] px-3 py-2.5 text-left text-[15px] text-ink transition-colors hover:bg-surface disabled:opacity-50"
              >
                <span className="grid size-8 place-items-center rounded-[6px] border border-line bg-surface text-[11px] font-semibold text-ink-2">{inst.slice(0, 2).toUpperCase()}</span>
                {inst}
                {busy === inst && <Loader2 className="ml-auto size-4 animate-spin text-ink-3" />}
              </button>
            </li>
          ))}
        </ul>
        <SandboxNote>Sandbox: no bank is contacted. Any choice connects a demo account.</SandboxNote>
      </Modal>
    </section>
  )
}

/** Send a commitment from a connected bank. */
export function FundDialog({ investment, accounts, onClose, onFunded }: { investment: Investment | null; accounts: FundingAccount[]; onClose: () => void; onFunded: (i: Investment) => void }) {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const chosen = accountId ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? null

  const send = async () => {
    if (!investment || !chosen) return
    setBusy(true)
    try {
      const inv = await api.fundInvestment(investment.id, chosen)
      toast.success(`${usd(inv.amount)} sent to ${inv.fundName}`)
      onFunded(inv)
    } catch (e) {
      toast.error('Couldn’t send funds', { description: actionError(e, 'Try again in a moment.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!investment} onOpenChange={(o) => !o && onClose()} title="Fund your commitment" locked={busy}>
      {investment && (
        <>
          <div className="border border-line bg-surface px-5 py-4">
            <p className="text-[14px] text-ink-3">{investment.fundName}</p>
            <p className="display tnum mt-1 text-[34px] leading-none text-ink">{usd(investment.amount)}</p>
          </div>
          {accounts.length === 0 ? (
            <p className="mt-5 text-[15px] text-ink-2">Connect a funding account first, from the Funding accounts panel on your dashboard.</p>
          ) : (
            <>
              <p className="mt-5 text-[14px] font-semibold text-ink">From</p>
              <div role="radiogroup" aria-label="Funding account" className="mt-2 grid gap-2">
                {accounts.map((a) => {
                  const on = a.id === chosen
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setAccountId(a.id)}
                      className={cn('flex items-center gap-3 rounded-[6px] border px-4 py-3 text-left text-[15px] transition-[border-color,box-shadow]', on ? 'border-accent shadow-[0_0_0_1px_var(--accent)]' : 'border-line-strong/60 hover:border-ink-2')}
                    >
                      <Building2 className={cn('size-4', on ? 'text-accent' : 'text-ink-3')} />
                      <span className="flex-1 text-ink">
                        {a.institution} •••• {a.last4}
                      </span>
                      {on && <Check className="size-4 text-accent" strokeWidth={2.5} />}
                    </button>
                  )
                })}
              </div>
              <Button size="lg" className="mt-6 w-full" onClick={send} loading={busy}>
                <Send className="size-4" /> Send {usd(investment.amount)}
              </Button>
            </>
          )}
          <SandboxNote>Sandbox: no money moves. The investment is marked funded.</SandboxNote>
        </>
      )}
    </Modal>
  )
}
