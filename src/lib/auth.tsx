// Who's signed in. The backend owns the session (cookie); this only mirrors `GET /me` for the UI.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api } from './api/client'
import type { Role, User } from './types'

interface AuthState {
  user: User | null
  loading: boolean
  setUser: (u: User | null) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setUser(await api.me())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const signOut = useCallback(async () => {
    await api.signOut()
    setUser(null)
  }, [])

  return <Ctx.Provider value={{ user, loading, setUser, refresh, signOut }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth must be inside AuthProvider')
  return c
}

export const homeFor = (role: Role) => (role === 'issuer' ? '/fund' : '/dashboard')

/** Renders children only for a signed-in user with `role`; otherwise sends them to sign in (or their own dashboard). */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!user) return <Navigate to={`/signin?as=${role}&next=${encodeURIComponent(location.pathname)}`} replace />
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />
  return <>{children}</>
}
