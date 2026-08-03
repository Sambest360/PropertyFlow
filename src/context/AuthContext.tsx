import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppUser, Permission, Role } from '../types/domain'
import {
  canImpersonateTarget,
  canSeeAgency,
  canSeeAgentRecord,
  canSeeLandlordAsset,
} from '../lib/agencyScope'
import { setApiActor } from '../lib/api/actorAuth'
import {
  apiLogin,
  apiLogout,
  apiMe,
  apiRegister,
  syncActorFromUser,
  type AuthUserDto,
} from '../lib/api/authClient'
import { isApiEnabled } from '../lib/api/config'
import { blockedPropertyIdsForApplicant } from '../lib/blockedApplicants'
import { effectiveCan, roleLabels, roleBlurbs } from '../lib/permissions'
import {
  isTenantOccupancyPermission,
  tenantHasApprovedOccupancy,
} from '../lib/tenantOccupancy'
import {
  buildPropertyScope,
  canMutateProperty,
  dealInScope,
  entityInPropertyScope,
  paymentInScope,
  propertyInScope,
  ticketInScope,
  threadInScope,
  toPropertyLinks,
  type PropertyScope,
} from '../lib/scope'
import { useStore } from './AppStore'

const AUTH_KEY = 'propertyflow-auth-user'
const REAL_AUTH_KEY = 'propertyflow-auth-real-user'
const DEMO_SWITCHER = import.meta.env.VITE_DEMO_SWITCHER === '1'

const GUEST_USER: AppUser = {
  id: 'guest',
  name: 'Guest',
  email: '',
  role: 'tenant',
  agencyId: null,
  active: false,
}

function dtoToAppUser(dto: AuthUserDto): AppUser {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    role: dto.role as Role,
    agencyId: dto.agencyId,
    phone: dto.phone,
    active: dto.active,
    enabledPermissions: dto.enabledPermissions as Permission[] | undefined,
    licenseStatus: (dto.licenseStatus as AppUser['licenseStatus']) ?? undefined,
    mentorId: dto.mentorId ?? undefined,
    commissionSharePct: dto.commissionSharePct ?? undefined,
    company: dto.company,
    idNumberOrPassport: dto.idNumberOrPassport,
    verification: dto.verification,
  }
}

type AuthContextValue = {
  user: AppUser
  realUser: AppUser
  role: Role
  agencyId: string | null
  agencyName: string | null
  isAuthenticated: boolean
  authReady: boolean
  isImpersonating: boolean
  demoSwitcherEnabled: boolean
  login: (email: string, password: string) => Promise<AppUser>
  register: (input: {
    email: string
    password: string
    firstName: string
    lastName: string
    phone?: string
    role?: string
    profile?: import('../lib/verification').VerificationProfile
    documents?: import('../lib/verification').VerificationDocument[]
  }) => Promise<{ user: AppUser; bootstrap: boolean }>
  logout: () => Promise<void>
  switchUser: (userId: string) => void
  impersonate: (userId: string) => boolean
  stopImpersonation: () => void
  has: (permission: Permission) => boolean
  hasAny: (permissions: Permission[]) => boolean
  roleLabel: string
  roleBlurb: string
  usersForSwitcher: AppUser[]
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { state, addActivity, refreshBootstrap } = useStore()
  const [authReady, setAuthReady] = useState(false)
  const [sessionUser, setSessionUser] = useState<AppUser | null>(null)
  const [userId, setUserId] = useState(() => localStorage.getItem(AUTH_KEY) || '')
  const [realUserId, setRealUserId] = useState<string | null>(() => localStorage.getItem(REAL_AUTH_KEY))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isApiEnabled) {
        setAuthReady(true)
        return
      }
      const me = await apiMe()
      if (cancelled) return
      if (me) {
        const appUser = dtoToAppUser(me)
        setSessionUser(appUser)
        setUserId(appUser.id)
        localStorage.setItem(AUTH_KEY, appUser.id)
        // Clear stale demo localStorage from prior versions on first real login.
        try {
          const legacy = ['propertyflow-v15', 'propertyflow-v16']
          for (const k of legacy) localStorage.removeItem(k)
        } catch {
          /* ignore */
        }
      } else {
        setSessionUser(null)
      }
      setAuthReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (userId) localStorage.setItem(AUTH_KEY, userId)
  }, [userId])

  useEffect(() => {
    if (realUserId) localStorage.setItem(REAL_AUTH_KEY, realUserId)
    else localStorage.removeItem(REAL_AUTH_KEY)
  }, [realUserId])

  const isAuthenticated = Boolean(sessionUser)

  const resolvedFromStore =
    (userId ? state.users.find((u) => u.id === userId) : null) ??
    (sessionUser ? state.users.find((u) => u.id === sessionUser.id) : null) ??
    sessionUser

  const user = isAuthenticated ? (resolvedFromStore ?? sessionUser ?? GUEST_USER) : GUEST_USER
  const realUser =
    (realUserId ? state.users.find((u) => u.id === realUserId) : null) ??
    sessionUser ??
    user
  const isImpersonating = Boolean(isAuthenticated && realUserId && realUserId !== user.id)
  const agency = state.agencies.find((a) => a.id === user.agencyId) ?? null

  useEffect(() => {
    if (!isAuthenticated || !user || user.id === 'guest') {
      setApiActor(null)
      return
    }
    setApiActor({
      userId: user.id,
      role: user.role,
      agencyId: user.agencyId,
    })
  }, [isAuthenticated, user.id, user.role, user.agencyId])

  useEffect(() => {
    if (!isApiEnabled) return
    if (!isAuthenticated || !user || user.id === 'guest') return
    void refreshBootstrap({
      userId: user.id,
      role: user.role,
      agencyId: user.agencyId,
    })
  }, [isAuthenticated, user.id, user.role, user.agencyId, refreshBootstrap])

  useEffect(() => {
    if (!isAuthenticated) return
    const actor = isImpersonating ? realUser : user
    if (actor.role === 'super_admin') return
    if (!user.agencyId) return
    const a = state.agencies.find((x) => x.id === user.agencyId)
    if (a?.status !== 'Suspended') return
    if (isImpersonating) {
      setUserId(realUser.id)
      setRealUserId(null)
      return
    }
  }, [user, realUser, isImpersonating, state.agencies, isAuthenticated])

  const value = useMemo<AuthContextValue>(() => {
    const agencyEnabled = agency?.enabledPermissions
    const occupancyReady =
      user.role !== 'tenant' ||
      tenantHasApprovedOccupancy(state.applications, state.tenancies, user)
    const has = (p: Permission) => {
      if (!isAuthenticated || user.id === 'guest') return false
      if (user.role === 'tenant' && isTenantOccupancyPermission(p) && !occupancyReady) {
        return false
      }
      return effectiveCan(user.role, p, agencyEnabled, user.enabledPermissions)
    }
    const hasAny = (ps: Permission[]) => ps.some((p) => has(p))

    return {
      user,
      realUser,
      role: user.role,
      agencyId: user.agencyId,
      agencyName: agency?.name ?? (user.role === 'super_admin' ? 'Platform' : null),
      isAuthenticated,
      authReady,
      isImpersonating,
      demoSwitcherEnabled: DEMO_SWITCHER,
      login: async (email, password) => {
        const res = await apiLogin({ email, password })
        const appUser = dtoToAppUser(res.user)
        setSessionUser(appUser)
        setUserId(appUser.id)
        setRealUserId(null)
        syncActorFromUser(res.user)
        await refreshBootstrap({
          userId: appUser.id,
          role: appUser.role,
          agencyId: appUser.agencyId,
        })
        return appUser
      },
      register: async (input) => {
        const res = await apiRegister(input)
        const appUser = dtoToAppUser(res.user)
        setSessionUser(appUser)
        setUserId(appUser.id)
        setRealUserId(null)
        syncActorFromUser(res.user)
        await refreshBootstrap({
          userId: appUser.id,
          role: appUser.role,
          agencyId: appUser.agencyId,
        })
        return { user: appUser, bootstrap: Boolean(res.bootstrap) }
      },
      logout: async () => {
        await apiLogout()
        setSessionUser(null)
        setUserId('')
        setRealUserId(null)
        localStorage.removeItem(AUTH_KEY)
      },
      switchUser: (id: string) => {
        if (!DEMO_SWITCHER) return
        setRealUserId(null)
        setUserId(id)
      },
      impersonate: (targetId: string) => {
        const target = state.users.find((u) => u.id === targetId)
        if (!target) return false
        const actor = isImpersonating ? realUser : user
        if (
          !effectiveCan(
            actor.role,
            'users.impersonate',
            state.agencies.find((a) => a.id === actor.agencyId)?.enabledPermissions,
            actor.enabledPermissions,
          )
        ) {
          return false
        }
        if (!canImpersonateTarget(actor, target)) return false
        if (!realUserId) setRealUserId(actor.id)
        setUserId(target.id)
        addActivity(`Impersonation started: ${actor.name} → ${target.name}`, actor.name, target.agencyId)
        return true
      },
      stopImpersonation: () => {
        if (!realUserId) return
        const actor = state.users.find((u) => u.id === realUserId)
        addActivity(
          `Impersonation ended: back to ${actor?.name ?? realUserId}`,
          actor?.name ?? 'Admin',
          actor?.agencyId ?? null,
        )
        setUserId(realUserId)
        setRealUserId(null)
      },
      has,
      hasAny,
      roleLabel: isAuthenticated ? roleLabels[user.role] : 'Guest',
      roleBlurb: isAuthenticated ? roleBlurbs[user.role] : 'Sign in to manage properties',
      usersForSwitcher: DEMO_SWITCHER
        ? state.users.filter((u) => {
            if (!u.active) return false
            const a = u.agencyId ? state.agencies.find((x) => x.id === u.agencyId) : null
            if (a?.status === 'Suspended') return false
            if (user.role === 'super_admin') return true
            if (u.role === 'super_admin') return false
            if (!user.agencyId) return u.id === user.id
            return u.agencyId === user.agencyId
          })
        : [],
    }
  }, [
    user,
    realUser,
    agency,
    isImpersonating,
    realUserId,
    state.users,
    state.agencies,
    state.applications,
    state.tenancies,
    addActivity,
    isAuthenticated,
    authReady,
    refreshBootstrap,
  ])

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
  const { state } = useStore()
  const agency = agencyId ? state.agencies.find((a) => a.id === agencyId) : null
  const agencySuspended = agency?.status === 'Suspended'

  const scopeAgency = (id: string | null | undefined) =>
    canSeeAgency(role, agencyId, agencySuspended, id)
  const scopeAgent = (agentId: string | null | undefined) =>
    canSeeAgentRecord(role, user.id, agentId)
  const scopeLandlord = (landlordId: string) => canSeeLandlordAsset(role, user.id, landlordId)
  return { scopeAgency, scopeAgent, scopeLandlord, user, role, agencyId, agencySuspended }
}

/**
 * Property-linked scope for the current user.
 * Prefer these helpers over ad-hoc agentId / landlordId checks on list/detail pages.
 */
export function usePropertyScope(): PropertyScope & {
  user: AppUser
  role: Role
  agencyId: string | null
  agencySuspended: boolean
  scopeAgency: (id: string | null | undefined) => boolean
  /** True when the property id is in the viewer’s linked book. */
  inPropertyScope: (propertyId: string | null | undefined) => boolean
  canMutate: (propertyId: string) => boolean
  ticketVisible: (ticket: Parameters<typeof ticketInScope>[1]) => boolean
  dealVisible: (entity: Parameters<typeof dealInScope>[1]) => boolean
  paymentVisible: (
    payment: Parameters<typeof paymentInScope>[1],
    opts?: Parameters<typeof paymentInScope>[2],
  ) => boolean
  threadVisible: (thread: Parameters<typeof threadInScope>[1]) => boolean
} {
  const { user, role, agencyId } = useAuth()
  const { state } = useStore()
  const agency = agencyId ? state.agencies.find((a) => a.id === agencyId) : null
  const agencySuspended = agency?.status === 'Suspended'

  const scope = useMemo(() => {
    const blockedPropertyIds = blockedPropertyIdsForApplicant(state.applications, user)
    return buildPropertyScope(
      { role, userId: user.id, agencyId, agencySuspended },
      {
        properties: toPropertyLinks(state.properties),
        applications: state.applications,
        tenancies: state.tenancies,
        tickets: state.tickets,
        blockedPropertyIds,
        viewerEmail: user.email,
      },
    )
  }, [
    role,
    user.id,
    user.email,
    agencyId,
    agencySuspended,
    state.properties,
    state.applications,
    state.tenancies,
    state.tickets,
  ])

  const scopeAgency = (id: string | null | undefined) =>
    canSeeAgency(role, agencyId, agencySuspended, id)

  return {
    ...scope,
    user,
    role,
    agencyId,
    agencySuspended,
    scopeAgency,
    inPropertyScope: (propertyId) => propertyInScope(scope, propertyId),
    canMutate: (propertyId) => {
      const p = state.properties.find((x) => x.id === propertyId)
      return canMutateProperty(scope, p ?? null, propertyId)
    },
    ticketVisible: (ticket) => ticketInScope(scope, ticket),
    dealVisible: (entity) => dealInScope(scope, entity),
    paymentVisible: (payment, opts) => paymentInScope(scope, payment, opts),
    threadVisible: (thread) => threadInScope(scope, thread),
  }
}

/** Re-export for callers that already import from AuthContext. */
export { entityInPropertyScope }
