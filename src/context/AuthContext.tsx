import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppUser, Permission, Role } from '../types/domain'
import { can, canAny, roleLabels, roleBlurbs } from '../lib/permissions'
import { useStore } from './AppStore'

const AUTH_KEY = 'propertyflow-auth-user'

type AuthContextValue = {
  user: AppUser
  role: Role
  agencyId: string | null
  agencyName: string | null
  switchUser: (userId: string) => void
  has: (permission: Permission) => boolean
  hasAny: (permissions: Permission[]) => boolean
  roleLabel: string
  roleBlurb: string
  usersForSwitcher: AppUser[]
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { state } = useStore()
  const [userId, setUserId] = useState(() => localStorage.getItem(AUTH_KEY) || 'u-amelia')

  useEffect(() => {
    localStorage.setItem(AUTH_KEY, userId)
  }, [userId])

  const user = state.users.find((u) => u.id === userId) ?? state.users[0]
  const agency = state.agencies.find((a) => a.id === user.agencyId) ?? null

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role: user.role,
      agencyId: user.agencyId,
      agencyName: agency?.name ?? (user.role === 'super_admin' ? 'Platform' : null),
      switchUser: setUserId,
      has: (p) => can(user.role, p),
      hasAny: (ps) => canAny(user.role, ps),
      roleLabel: roleLabels[user.role],
      roleBlurb: roleBlurbs[user.role],
      usersForSwitcher: state.users.filter((u) => u.active),
    }),
    [user, agency, state.users],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** Scope helper: filter by agency unless super admin */
export function useAgencyScope() {
  const { user, role, agencyId } = useAuth()
  const scopeAgency = (id: string | null | undefined) => {
    if (role === 'super_admin') return true
    if (!agencyId) return false
    return id === agencyId
  }
  const scopeAgent = (agentId: string | null | undefined) => {
    if (role === 'super_admin' || role === 'client_admin' || role === 'agent_admin') return true
    if (role === 'ground_agent' || role === 'agent') return agentId === user.id
    return true
  }
  const scopeLandlord = (landlordId: string) => {
    if (role === 'landlord') return landlordId === user.id
    return true
  }
  return { scopeAgency, scopeAgent, scopeLandlord, user, role, agencyId }
}
