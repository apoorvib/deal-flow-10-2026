// The API owns auth and HttpOnly session cookies; client state mirrors GET /me.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api } from './api/client'
import type { AdminContext, AdminView, Role, User } from './types'

interface AuthState {
  user: User | null
  loading: boolean
  setUser: (u: User | null) => void
  refresh: () => Promise<void>
  signOut: () => Promise<void>
  admin: AdminContext | null
  switchTo: (as: AdminView) => Promise<string>
}
const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [admin, setAdmin] = useState<AdminContext | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try {
      const [u, a] = await Promise.all([api.me(), api.adminContext()])
      setUser(u)
      setAdmin(a)
    } finally { setLoading(false) }
  }, [])
  const switchTo = useCallback(async (as: AdminView) => {
    const ctx = await api.adminSwitch(as)
    setAdmin(ctx)
    setUser(await api.me())
    return as === 'visitor' ? '/' : homeFor(as === 'admin' ? 'admin' : as)
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const signOut = useCallback(async () => {
    await api.signOut()
    setUser(null)
    setAdmin(null)
  }, [])
  return <Ctx.Provider value={{ user, loading, setUser, refresh, signOut, admin, switchTo }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const context = useContext(Ctx)
  if (!context) throw new Error('useAuth must be inside AuthProvider')
  return context
}
export const homeFor = (role: Role) => (role === 'issuer' ? '/fund' : role === 'admin' ? '/admin' : '/dashboard')
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!user) return <Navigate to={`/signin?as=${role}&next=${encodeURIComponent(location.pathname)}`} replace />
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />
  return <>{children}</>
}
