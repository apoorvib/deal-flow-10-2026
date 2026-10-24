// Account creation inside onboarding. The real backend requires a signed-in session for KYC, uploads and
// submission, so a visitor creates their account on step 1. The password lives only in memory here:
// it is never written to the persisted draft.

import { createContext, useContext, useState, type ReactNode } from 'react'
import { isMock } from '../../lib/api/client'
import { useAuth } from '../../lib/auth'

interface AccountState {
  /** A visitor on the real backend: step 1 must create an account. */
  needsAccount: boolean
  /** Signed in: the application must use this email. */
  lockedEmail: string | null
  password: string
  setPassword: (v: string) => void
}

const Ctx = createContext<AccountState | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const value: AccountState = {
    needsAccount: !isMock && !user,
    lockedEmail: user && user.role !== 'admin' ? user.email : null,
    password,
    setPassword,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAccount() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAccount must be inside AccountProvider')
  return c
}

export const MIN_PASSWORD = 10
