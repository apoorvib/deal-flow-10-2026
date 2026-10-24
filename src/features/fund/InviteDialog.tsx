import { ArrowLeft, Check, FlaskConical, Mail, Send, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog } from 'radix-ui'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import { Field, MoneyInput } from '../../components/ui/field'
import logo from '../../assets/savy-logo.png'
import { api, isMock } from '../../lib/api/client'
import { BRAND } from '../../lib/brand'
import type { Fund, Invite } from '../../lib/types'

const parseEmails = (raw: string) =>
  [...new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]
const valid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

/** Fund side: paste emails, send verification requests. In the sandbox, preview each email and follow its link. */
export function InviteDialog({ fund, open, onOpenChange, onSent }: { fund: Fund; open: boolean; onOpenChange: (o: boolean) => void; onSent: () => void }) {
  const navigate = useNavigate()
  const [raw, setRaw] = useState('')
  const [commitment, setCommitment] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<{ invites: Invite[]; links: Record<string, string> } | null>(null)
  const [preview, setPreview] = useState<Invite | null>(null)

  const emails = parseEmails(raw)
  const bad = emails.filter((e) => !valid(e))

  const reset = () => {
    setRaw('')
    setCommitment(null)
    setSent(null)
    setPreview(null)
  }

  const send = async () => {
    if (!emails.length || bad.length) return
    setBusy(true)
    try {
      const res = await api.inviteInvestors(emails.map((email) => ({ email, commitment: commitment ?? undefined })))
      setSent({ invites: res.invites, links: res.devLinks ?? {} })
      onSent()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setTimeout(reset, 200)
      }}
    >
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
                className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-line bg-raised shadow-lift focus:outline-none"
              >
                <div className="flex items-start justify-between gap-4 border-b border-line px-7 py-5">
                  <Dialog.Title className="display text-[26px] text-ink">{preview ? 'Email preview' : sent ? 'Invitations sent' : 'Invite LPs'}</Dialog.Title>
                  <Dialog.Close className="-m-1.5 rounded-[4px] p-1.5 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label="Close">
                    <X className="size-5" />
                  </Dialog.Close>
                </div>

                <div className="px-7 py-6">
                  {preview ? (
                    <EmailPreview
                      fund={fund}
                      invite={preview}
                      onBack={() => setPreview(null)}
                      onVerify={() => {
                        onOpenChange(false)
                        navigate(sent!.links[preview.email])
                      }}
                    />
                  ) : sent ? (
                    <div>
                      <p className="text-[16px] text-ink-2">
                        {sent.invites.length} {sent.invites.length === 1 ? 'investor' : 'investors'} will get a link to verify for {fund.name}. They show as Invited until they clear.
                      </p>
                      <ul className="mt-5 divide-y divide-line border-y border-line">
                        {sent.invites.map((i) => (
                          <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                            <span className="flex min-w-0 items-center gap-2.5 text-[15px] text-ink">
                              <Check className="size-4 shrink-0 text-ok" strokeWidth={2.5} />
                              <span className="truncate">{i.email}</span>
                            </span>
                            {isMock && (
                              <button type="button" className="link shrink-0 text-[14px] font-semibold" onClick={() => setPreview(i)}>
                                Preview email
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                      {isMock && (
                        <p className="mt-4 flex items-center gap-1.5 text-[13px] text-ink-3">
                          <FlaskConical className="size-3.5" /> Sandbox: no email is sent. Preview one to follow its link as the investor.
                        </p>
                      )}
                      <div className="mt-6 flex justify-end gap-2">
                        <Button variant="ghost" onClick={reset}>
                          Invite more
                        </Button>
                        <Dialog.Close asChild>
                          <Button>Done</Button>
                        </Dialog.Close>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-5">
                      <Field label="Investor emails" hint="Paste one or many, separated by commas or new lines" error={bad.length ? `Check ${bad[0]}` : null}>
                        <textarea
                          autoFocus
                          rows={4}
                          value={raw}
                          onChange={(e) => setRaw(e.target.value)}
                          placeholder="priya@example.com, marcus@example.com"
                          className="w-full rounded-[4px] border border-line-strong bg-raised px-3.5 py-3 text-[16px] text-ink placeholder:text-ink-3/70 focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
                        />
                      </Field>
                      <Field label="Expected commitment" optional>
                        <MoneyInput value={commitment} onChange={setCommitment} />
                      </Field>
                      <Button size="lg" onClick={send} loading={busy} disabled={!emails.length || bad.length > 0}>
                        <Send className="size-4" /> {emails.length > 1 ? `Send ${emails.length} invitations` : 'Send invitation'}
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}

/** What lands in the LP's inbox. */
function EmailPreview({ fund, invite, onBack, onVerify }: { fund: Fund; invite: Invite; onBack: () => void; onVerify: () => void }) {
  return (
    <div>
      <button type="button" onClick={onBack} className="link mb-4 inline-flex items-center gap-1 text-[14px] font-semibold">
        <ArrowLeft className="size-3.5" /> All invitations
      </button>
      <div className="border border-line bg-surface">
        <div className="space-y-1 border-b border-line px-5 py-3 text-[13px] text-ink-3">
          <p className="flex items-center gap-1.5">
            <Mail className="size-3.5" /> From {BRAND.name} on behalf of {fund.manager}
          </p>
          <p>To {invite.email}</p>
          <p className="text-ink">Subject: {fund.manager} invited you to verify for {fund.name}</p>
        </div>
        <div className="bg-raised px-7 py-8 text-center">
          <img src={logo} alt={BRAND.name} className="mx-auto h-8 w-auto" />
          <h3 className="display mt-6 text-[24px] leading-tight text-ink">{fund.manager} needs to verify you&rsquo;re accredited</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            Before you invest in {fund.name}, confirm your accredited status with {BRAND.name}. It takes about 10 minutes, and {fund.manager} only sees whether you qualify, never your documents.
          </p>
          <Button size="lg" className="mt-6" onClick={onVerify}>
            Verify my accreditation
          </Button>
          <p className="mt-5 text-[13px] text-ink-3">Already verified with {BRAND.name}? The same button shares your passport in one step.</p>
        </div>
      </div>
    </div>
  )
}
