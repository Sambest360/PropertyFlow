import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppUser, Permission, Role } from '../types/domain'
import {
  canImpersonateTarget,
  canSeeAgency,
  canSeeAgentRecord,
  canSeeLandlordAsset,
  pickAgencyId,
  resolveViewerAgencyId,
} from '../lib/agencyScope'
import { agencyBlocksStaffAccess } from '../lib/agencyStatus'
import { setApiActor } from '../lib/api/actorAuth'
import {
  apiLogin,
  apiLogout,
  apiMe,
  API_ME_RETRY_TIMEOUT_MS,
  readAuthToken,
  SESSION_PROBE_MAX_MS,
  apiRegister,
  syncActorFromUser,
  type AuthUserDto,
} from '../lib/api/authClient'
import { isApiEnabled, isSupabaseMode } from '../lib/api/config'
import { portalHydrationUserId, sessionUserSwitched } from '../lib/clientCache'
import { isBootstrapFetchInFlight, shouldSkipAuthBootstrapRefresh } from '../lib/bootstrapCoord'
import { isStaleSessionProbe } from '../lib/auth/sessionProbeCoord'
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
import {
  appUserToDto,
  onSupabaseAuthChange,
  supabaseGetSessionUser,
  supabaseSignIn,
  supabaseSignOut,
  supabaseSignUp,
} from '../lib/supabase/auth'
import {
  beginGuestPurge,
  clearSessionArtifacts,
  consumeStaleSignOutIgnore,
  deferredAuthDecisionsInFlight,
  endGuestPurge,
  guestPurgeGenerationCurrent,
  guestPurgesInFlight,
  guestSignOutRemoveSuppressed,
  isLoginInFlight,
  isRegisterInFlight,
  setGuestPurgeDrainHook,
  setLoginInFlight,
  setRegisterInFlight,
  shieldGuestPurgeForLogin,
} from '../lib/auth/sessionArtifacts'
import { AUTH_USER_STORAGE_KEY } from '../lib/clientCache'

const AUTH_KEY = AUTH_USER_STORAGE_KEY
const REAL_AUTH_KEY = 'propertyflow-auth-real-user'
const DEMO_SWITCHER = import.meta.env.VITE_DEMO_SWITCHER === '1'

/** Restore client-side impersonation after auth session resolves. */
function resolveActiveUserId(sessionUserId: string): {
  activeUserId: string
  realUserId: string | null
} {
  const storedReal = localStorage.getItem(REAL_AUTH_KEY)
  const storedActive = localStorage.getItem(AUTH_KEY)
  if (
    storedReal &&
    storedReal === sessionUserId &&
    storedActive &&
    storedActive !== sessionUserId
  ) {
    return { activeUserId: storedActive, realUserId: storedReal }
  }
  localStorage.removeItem(REAL_AUTH_KEY)
  localStorage.setItem(AUTH_KEY, sessionUserId)
  return { activeUserId: sessionUserId, realUserId: null }
}

/** Auth session profile wins over bootstrap store for identity fields. */
function mergeAuthUser(session: AppUser, fromStore: AppUser | null | undefined): AppUser {
  if (!fromStore || fromStore.id !== session.id) return session
  return {
    ...fromStore,
    ...session,
    role: session.role,
    email: session.email,
    name: session.name,
    active: session.active,
    agencyId: pickAgencyId(session.agencyId, fromStore.agencyId),
    enabledPermissions: session.enabledPermissions ?? fromStore.enabledPermissions,
  }
}

function applySessionUser(
  profile: AppUser,
  setSessionUser: (u: AppUser) => void,
  setUserId: (id: string) => void,
  setRealUserId: (id: string | null) => void,
) {
  setSessionUser(profile)
  const { activeUserId, realUserId } = resolveActiveUserId(profile.id)
  setUserId(activeUserId)
  setRealUserId(realUserId)
  syncActorFromUser(appUserToDto(profile))
}

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
    mustChangePassword: dto.mustChangePassword === true ? true : undefined,
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
  /** P0-session (R8): full anonymous wipe — sign out + clear every artifact.
   *  Auth pages call this on mount so a previous user's live session can never
   *  hydrate there ("Riaan on /register", "Samuel on /login"). */
  purgeLocalIdentity: () => Promise<void>
  /** True while login() is shielding the session through the first portal commit. */
  loginInFlight: boolean
  switchUser: (userId: string) => void
  impersonate: (userId: string) => boolean
  stopImpersonation: () => void
  has: (permission: Permission) => boolean
  hasAny: (permissions: Permission[]) => boolean
  roleLabel: string
  roleBlurb: string
  usersForSwitcher: AppUser[]
  /** D3: the session must change its password (after a staff reset) before anything else. */
  mustChangePassword: boolean
  /** D3: call after a successful change-password; loads the workspace. */
  completePasswordChange: (user?: AuthUserDto) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    state,
    addActivity,
    refreshBootstrap,
    resetForUserSwitch,
    hydratedForUserId,
    hydrationFailed,
  } = useStore()
  const [authReady, setAuthReady] = useState(false)
  const [sessionUser, setSessionUser] = useState<AppUser | null>(null)
  // remint58 grace2: React mirror of the module loginInFlight flag so
  // RequireAuth re-renders when the post-sign-in hold drops.
  const [loginInFlight, setLoginInFlightState] = useState(false)
  const loginHoldGen = useRef(0)
  const releaseRequestedGen = useRef<number | null>(null)
  const [userId, setUserId] = useState(() => localStorage.getItem(AUTH_KEY) || '')
  const [realUserId, setRealUserId] = useState<string | null>(() => localStorage.getItem(REAL_AUTH_KEY))
  const [mustChangePassword, setMustChangePassword] = useState(false)
  /** Bumped on login / password change / logout so slow /me cannot rewind state. */
  const sessionProbeGenRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    // P0-8 (E2E #2): a stalled session probe must never wedge the shell on
    // "Checking session…". Resolve as guest after the timeout; a late profile
    // still applies through onAuthStateChange / refresh.
    // Mode A Sipho: do NOT flip authReady→guest at 5s while propertyflow-auth-user
    // still suggests a JWT — that opened RequireAuth→/login→purgeLocalIdentity
    // and wiped a still-verifying session (My applications Sign-in bounce).
    const readyTimeout = window.setTimeout(() => {
      if (cancelled) return
      try {
        if (localStorage.getItem(AUTH_KEY)) return
      } catch {
        /* ignore */
      }
      setAuthReady(true)
    }, 5000)
    const hardReadyTimeout = window.setTimeout(() => {
      if (!cancelled) setAuthReady(true)
    }, SESSION_PROBE_MAX_MS)
    ;(async () => {
      if (isSupabaseMode) {
        // remint60: this probe can still be awaiting getUser across login().
        // Capture the hold generation now; a later miss must not wipe the
        // session login() painted (APP + TN) once the generation moved or
        // loginInFlight is up. #60's sign-out credit does not cover this caller.
        const probeHoldGen = loginHoldGen.current
        const probeGen = sessionProbeGenRef.current
        const profile = await supabaseGetSessionUser()
        if (cancelled) return
        clearTimeout(readyTimeout)
        clearTimeout(hardReadyTimeout)
        if (isStaleSessionProbe(probeGen, sessionProbeGenRef.current)) {
          setAuthReady(true)
          return
        }
        if (profile) {
          setMustChangePassword(profile.mustChangePassword === true)
          applySessionUser(profile, setSessionUser, setUserId, setRealUserId)
        } else if (loginHoldGen.current !== probeHoldGen || isLoginInFlight()) {
          // Stale probe. Returning null is fine; do not clearSessionArtifacts.
        } else {
          // P0-session (R11): leftover propertyflow-auth-* / sb-* must not keep
          // a signed-out browser looking authenticated on the next probe.
          clearSessionArtifacts({ setSessionUser, setUserId, setRealUserId })
          setApiActor(null)
        }
        setAuthReady(true)
        return
      }
      if (!isApiEnabled) {
        clearTimeout(readyTimeout)
        clearTimeout(hardReadyTimeout)
        setAuthReady(true)
        return
      }
      const probeGen = sessionProbeGenRef.current
      let me = await apiMe()
      if (cancelled) return
      // Cold typed /workspace loads can exceed a short /me probe; retry once
      // before treating the session as absent (E2E L02 / P04).
      if (!me && readAuthToken()) {
        me = await apiMe(API_ME_RETRY_TIMEOUT_MS)
        if (cancelled) return
      }
      if (isStaleSessionProbe(probeGen, sessionProbeGenRef.current)) return
      setMustChangePassword(me?.mustChangePassword === true)
      if (me) {
        const appUser = dtoToAppUser(me)
        applySessionUser(appUser, setSessionUser, setUserId, setRealUserId)
        try {
          const legacy = ['propertyflow-v15', 'propertyflow-v16']
          for (const k of legacy) localStorage.removeItem(k)
        } catch {
          /* ignore */
        }
      } else if (!readAuthToken()) {
        // Only wipe when there is no JWT — timeouts must not POST /logout (L02).
        clearSessionArtifacts({ setSessionUser, setUserId, setRealUserId })
        setApiActor(null)
      }
      clearTimeout(readyTimeout)
      clearTimeout(hardReadyTimeout)
      setAuthReady(true)
    })()
    return () => {
      cancelled = true
      clearTimeout(readyTimeout)
      clearTimeout(hardReadyTimeout)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseMode) return
    const { unsubscribe } = onSupabaseAuthChange((profile) => {
      // P0-register (R8): while a registration is in flight, a previous
      // user's live session can fire auth-change events (token refresh,
      // INITIAL_SESSION on a late subscribe). Never hydrate that old identity
      // into the shell mid-registration — the register flow owns the session.
      // P0 empty-DB SA: same for login — a late null from auth-change must not
      // clear the Super Admin session that login() just applied.
      if (profile) {
        // Mid-login the login() apply already owns the shell; ignore echoes.
        if (isRegisterInFlight() || isLoginInFlight()) return
        setMustChangePassword(profile.mustChangePassword === true)
        applySessionUser(profile, setSessionUser, setUserId, setRealUserId)
        return
      }
      // remint58: a guest-mount signOut can resolve after login() and emit
      // signed-out. Ignore that null while the hold is up, and once more if
      // it was armed as a stale pre-login purge (even after the hold drops).
      // remint59 grace3: do NOT spend the one post-hold credit while the hold
      // is still up — that credit is only for a null that arrives at the
      // check below, after releaseLoginHold.
      if (isRegisterInFlight()) return
      if (isLoginInFlight()) return
      if (consumeStaleSignOutIgnore()) return
      setSessionUser(null)
      setUserId('')
      setRealUserId(null)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (userId) localStorage.setItem(AUTH_KEY, userId)
  }, [userId])

  useEffect(() => {
    if (realUserId) localStorage.setItem(REAL_AUTH_KEY, realUserId)
    else localStorage.removeItem(REAL_AUTH_KEY)
  }, [realUserId])

  useEffect(() => {
    if (!isSupabaseMode || !sessionUser) return
    const impersonating =
      Boolean(realUserId && realUserId === sessionUser.id && userId && userId !== sessionUser.id)
    if (impersonating) return
    if (userId !== sessionUser.id) {
      setUserId(sessionUser.id)
      setRealUserId(null)
      localStorage.setItem(AUTH_KEY, sessionUser.id)
      localStorage.removeItem(REAL_AUTH_KEY)
    }
  }, [sessionUser?.id, userId, realUserId])

  // P0-session (R9): sign-out in ANOTHER tab must not leave this tab holding
  // the identity. AuthContext reads AUTH_KEY directly from localStorage for
  // its initial state — when the storage event says the key was REMOVED while
  // we have no live session proof, drop back to guest.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== AUTH_KEY) return
      if (e.newValue == null && !sessionUser) {
        setUserId('')
        setRealUserId(null)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [sessionUser])

  const isAuthenticated = Boolean(sessionUser)

  const impersonating =
    Boolean(sessionUser && realUserId && userId && realUserId === sessionUser.id && userId !== sessionUser.id)

  const storeUser = userId ? state.users.find((u) => u.id === userId) : null

  const user = useMemo(() => {
    if (!isAuthenticated || !sessionUser) return GUEST_USER
    if (impersonating && storeUser) return storeUser
    const fromStore =
      state.users.find((u) => u.id === sessionUser.id) ??
      (userId && userId !== sessionUser.id ? storeUser : null)
    return mergeAuthUser(sessionUser, fromStore)
  }, [isAuthenticated, sessionUser, impersonating, storeUser, state.users, userId])

  const realUser =
    (realUserId ? state.users.find((u) => u.id === realUserId) : null) ??
    sessionUser ??
    user
  const isImpersonating = impersonating
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

  // spec-portal-first-load: when the signed-in session user changes (A → B),
  // drop A's in-memory store before B's bootstrap lands. Impersonation keeps the
  // same session user and is not a switch.
  const lastSessionUserIdRef = useRef<string | null>(sessionUser?.id ?? null)
  useEffect(() => {
    if (!isApiEnabled && !isSupabaseMode) return // demo mode: as on main
    const next = sessionUser?.id ?? null
    const prev = lastSessionUserIdRef.current
    if (sessionUserSwitched(prev, next)) resetForUserSwitch()
    if (next) lastSessionUserIdRef.current = next
  }, [sessionUser?.id, resetForUserSwitch])

  useEffect(() => {
    if (!isApiEnabled && !isSupabaseMode) return
    if (!isAuthenticated || !user || user.id === 'guest') return
    if (isBootstrapFetchInFlight()) return
    if (
      shouldSkipAuthBootstrapRefresh(user.id, hydratedForUserId) &&
      state.users.length > 0 &&
      !hydrationFailed
    ) {
      return
    }
    void refreshBootstrap({
      userId: user.id,
      role: user.role,
      agencyId: user.agencyId,
    })
  }, [
    isAuthenticated,
    user.id,
    user.role,
    user.agencyId,
    hydratedForUserId,
    state.users.length,
    refreshBootstrap,
  ])

  // P04 / P09b: mount bootstrap can soft-miss (lite tenant) or run with a null
  // actor before apiMe lands — recover with a forced full refresh once Auth knows the actor.
  const hydrationFailureAutoRetryRef = useRef(false)
  useEffect(() => {
    if (!hydrationFailed) {
      hydrationFailureAutoRetryRef.current = false
      return
    }
    if (!isApiEnabled && !isSupabaseMode) return
    if (!isAuthenticated || !user || user.id === 'guest') return
    const sessionTarget = portalHydrationUserId(true, user.id)
    if (sessionTarget && hydratedForUserId === sessionTarget) return
    if (hydrationFailureAutoRetryRef.current) return
    if (isBootstrapFetchInFlight()) return
    hydrationFailureAutoRetryRef.current = true
    void refreshBootstrap(
      { userId: user.id, role: user.role, agencyId: user.agencyId },
      { force: true, full: true },
    )
  }, [
    isAuthenticated,
    user.id,
    user.role,
    user.agencyId,
    hydratedForUserId,
    hydrationFailed,
    refreshBootstrap,
  ])

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

  const releaseLoginHold = useCallback(() => {
    const gen = releaseRequestedGen.current
    if (gen == null) return
    // An in-flight guest purge must finish (and skip its clear) before the
    // shield drops — otherwise its late signOut null races the portal commit.
    // remint59 grace3: two macrotasks after purge drain is not enough. The
    // sign-out's deferred SIGNED_OUT / SIGNED_IN getUser can still cb(null)
    // after that. Stay up until that decision can no longer reach the
    // post-hold setSessionUser(null).
    if (guestPurgesInFlight() > 0) return
    if (deferredAuthDecisionsInFlight() > 0) return
    window.setTimeout(() => {
      window.setTimeout(() => {
        if (releaseRequestedGen.current !== gen) return
        if (guestPurgesInFlight() > 0) return
        if (deferredAuthDecisionsInFlight() > 0) return
        releaseRequestedGen.current = null
        setLoginInFlight(false)
        setLoginInFlightState(false)
      }, 0)
    }, 0)
  }, [])

  useEffect(() => {
    setGuestPurgeDrainHook(() => {
      if (releaseRequestedGen.current == null) return
      releaseLoginHold()
    })
    return () => setGuestPurgeDrainHook(null)
  }, [releaseLoginHold])

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
      loginInFlight,
      login: async (email, password) => {
        // P0 empty-DB SA: block LoginPage mount purge + auth-change null from
        // wiping the session we are about to apply.
        // remint58 grace2: do NOT drop the shield in finally. LoginPage
        // navigates only after this promise resolves; a guest purge that
        // already awaited signOut, and the deferred signed-out callback,
        // must still see the hold (or a generation ignore) until the portal
        // route has committed.
        const holdGen = ++loginHoldGen.current
        releaseRequestedGen.current = null
        setLoginInFlight(true)
        setLoginInFlightState(true)
        shieldGuestPurgeForLogin()
        sessionProbeGenRef.current += 1
        try {
          if (isSupabaseMode) {
            const appUser = await supabaseSignIn(email, password)
            const { writeAuthToken } = await import('../lib/api/authClient')
            writeAuthToken(null)
            const mustChange = appUser.mustChangePassword === true
            setMustChangePassword(mustChange)
            setSessionUser(appUser)
            setUserId(appUser.id)
            setRealUserId(null)
            syncActorFromUser(appUserToDto(appUser))
            if (!mustChange) {
              void refreshBootstrap({
                userId: appUser.id,
                role: appUser.role,
                agencyId: appUser.agencyId,
              })
            }
            if (loginHoldGen.current === holdGen) {
              releaseRequestedGen.current = holdGen
              releaseLoginHold()
            }
            return appUser
          }
          const res = await apiLogin({ email, password })
          const appUser = dtoToAppUser(res.user)
          const mustChange = res.user.mustChangePassword === true
          setMustChangePassword(mustChange)
          setSessionUser(appUser)
          setUserId(appUser.id)
          setRealUserId(null)
          syncActorFromUser(res.user)
          // D3: the server refuses bootstrap until the password is changed.
          if (!mustChange) {
            void refreshBootstrap({
              userId: appUser.id,
              role: appUser.role,
              agencyId: appUser.agencyId,
            })
          }
          if (loginHoldGen.current === holdGen) {
            releaseRequestedGen.current = holdGen
            releaseLoginHold()
          }
          return appUser
        } catch (err) {
          // The guest purge was invalidated for this attempt; on failure it
          // will not clear. Restore anonymity ourselves.
          if (loginHoldGen.current === holdGen) {
            releaseRequestedGen.current = null
            setLoginInFlight(false)
            setLoginInFlightState(false)
            clearSessionArtifacts({ setSessionUser, setUserId, setRealUserId })
            setApiActor(null)
          }
          throw err
        }
      },
      register: async (input) => {
        // P0-1: on any failure the visitor must stay anonymous — never attach a
        // stale/cached identity (e.g. a previous Super Admin session) to the
        // register flow. Clear first, then attempt; on error, clear again.
        // P0-register (R8): the in-flight flag keeps a previous user's live
        // session from re-hydrating through onAuthStateChange mid-register.
        // remint61 / FW-06 L01: reuse the login navigation hold so a mount
        // session probe that started on /register cannot clearSessionArtifacts
        // after signup (landlord wizard is slow) and RequireAuth must not
        // bounce to /login?next=/workspace before the portal route commits.
        setRegisterInFlight(true)
        const holdGen = ++loginHoldGen.current
        releaseRequestedGen.current = null
        setLoginInFlight(true)
        setLoginInFlightState(true)
        shieldGuestPurgeForLogin()
        try {
          let result: { user: AppUser; bootstrap: boolean }
          if (isSupabaseMode) {
            const res = await supabaseSignUp(input)
            setSessionUser(res.user)
            setUserId(res.user.id)
            setRealUserId(null)
            syncActorFromUser(appUserToDto(res.user))
            void refreshBootstrap({
              userId: res.user.id,
              role: res.user.role,
              agencyId: res.user.agencyId,
            })
            result = { user: res.user, bootstrap: res.bootstrap }
          } else {
            const res = await apiRegister(input)
            const appUser = dtoToAppUser(res.user)
            setSessionUser(appUser)
            setUserId(appUser.id)
            setRealUserId(null)
            syncActorFromUser(res.user)
            void refreshBootstrap({
              userId: appUser.id,
              role: appUser.role,
              agencyId: appUser.agencyId,
            })
            result = { user: appUser, bootstrap: Boolean(res.bootstrap) }
          }
          if (loginHoldGen.current === holdGen) {
            releaseRequestedGen.current = holdGen
            releaseLoginHold()
          }
          return result
        } catch (err) {
          if (loginHoldGen.current === holdGen) {
            releaseRequestedGen.current = null
            setLoginInFlight(false)
            setLoginInFlightState(false)
            // P0-1: the shared guard module is the source of truth for the wipe.
            clearSessionArtifacts({ setSessionUser, setUserId, setRealUserId })
            setApiActor(null)
          }
          throw err
        } finally {
          setRegisterInFlight(false)
        }
      },
      logout: async () => {
        // P0-2A / P0-session (R11): same wipe as signOutAndRedirect (token +
        // propertyflow-auth-* + sb-*auth*), so leftover Super Admin cannot
        // resurrect from localStorage alone after a soft logout.
        try {
          if (isSupabaseMode) await supabaseSignOut()
          else await apiLogout()
        } catch {
          /* fall through — session artifacts cleared below regardless */
        }
        clearSessionArtifacts({ setSessionUser, setUserId, setRealUserId })
        setApiActor(null)
        sessionProbeGenRef.current += 1
        setMustChangePassword(false)
      },
      purgeLocalIdentity: async () => {
        // P0-session (R8): the full anonymous wipe shared by logout and the
        // auth pages' mount purge. Same source of truth as logout — sign out
        // server-side first (best effort), then clear every artifact.
        // P0 empty-DB SA: if login already started, do not sign out / clear —
        // LoginPage mounts purge on every visit including /login?next= kicks.
        // remint58: a purge that started before login() must not clear after
        // signOut resolves — login() bumps the purge generation.
        if (isLoginInFlight() || isRegisterInFlight()) return
        const generation = beginGuestPurge()
        try {
          try {
            if (isSupabaseMode) {
              // Once shieldGuestPurgeForLogin invalidates this purge, skip
              // GoTrue _removeSession. A generation check after this await
              // cannot put the JWT back.
              await supabaseSignOut({ skipRemoveSession: guestSignOutRemoveSuppressed })
            } else await apiLogout()
          } catch {
            /* fall through — artifacts cleared below regardless */
          }
          if (isLoginInFlight() || isRegisterInFlight()) return
          if (!guestPurgeGenerationCurrent(generation)) return
          clearSessionArtifacts({ setSessionUser, setUserId, setRealUserId })
          setApiActor(null)
        } finally {
          endGuestPurge()
        }
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
        if (actor.id === target.id) return false
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
      mustChangePassword,
      completePasswordChange: (confirmedUser?: AuthUserDto) => {
        sessionProbeGenRef.current += 1
        setMustChangePassword(confirmedUser?.mustChangePassword === true ? true : false)
        if (isAuthenticated && user.id !== 'guest') {
          void refreshBootstrap(
            { userId: user.id, role: user.role, agencyId: user.agencyId },
            { force: true },
          )
        }
      },
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
    loginInFlight,
    refreshBootstrap,
    releaseLoginHold,
    mustChangePassword,
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
  const { user, role, agencyId: sessionAgencyId } = useAuth()
  const { state } = useStore()
  const scopeCtx = useMemo(
    () => ({
      agencies: state.agencies,
      bootstrapAgencyId: state.users.find((u) => u.id === user.id)?.agencyId ?? null,
    }),
    [state.agencies, state.users, user.id],
  )
  const agencyId = useMemo(
    () => resolveViewerAgencyId(sessionAgencyId, scopeCtx),
    [sessionAgencyId, scopeCtx],
  )
  const agency = agencyId ? state.agencies.find((a) => a.id === agencyId) : null
  const agencySuspended = agencyBlocksStaffAccess(agency?.status)

  const scopeAgency = (id: string | null | undefined) =>
    canSeeAgency(role, agencyId, agencySuspended, id, scopeCtx)
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
  const agencySuspended = agencyBlocksStaffAccess(agency?.status)

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
        agencyContractors: state.agencyContractors,
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
    state.agencyContractors,
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
