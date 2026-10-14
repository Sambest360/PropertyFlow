import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { AuthField, AuthShell } from '../../components/auth/AuthShell'
import { PasswordField } from '../../components/auth/PasswordField'
import { Button, Input } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { apiAuthBootstrapNeeded, readAuthToken } from '../../lib/api/authClient'
import {
  supabaseAttachPendingRegistrationDocs,
  supabaseBootstrapNeeded,
} from '../../lib/supabase/auth.js'
import { isSupabaseMode } from '../../lib/api/config'
import {
  clearPendingRegistrationDocs,
  readPendingRegistrationDocs,
} from '../../lib/auth/registrationDocs'
import { showAuthError } from '../../lib/sweetAlert'
import { resolvePostLoginPath } from '../../lib/workspaceRoutes'
import { createClient } from '../../utils/supabase/client'

const ICON_STROKE = 1.6

export default function LoginPage() {
  const { login, isAuthenticated, authReady, user, purgeLocalIdentity } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const nextParam = params.get('next')
  const next = nextParam || (location.state as { from?: string } | null)?.from || '/workspace'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [bootstrapNeeded, setBootstrapNeeded] = useState(false)
  const registered = params.get('registered')

  // P0-session (R8): auth pages are anonymous zones. A previous user's live
  // Supabase session (shared browser / stale tab) must never hydrate here —
  // otherwise /login silently redirects into that user's workspace (the
  // sticky "Riaan / Samuel" symptom). Purge intentional /login visits early
  // while still a guest.
  // Mode A Sipho: RequireAuth false-guest bounce (/login?next=/workspace/…)
  // must NOT purge until authReady confirms guest — otherwise we wipe a
  // still-verifying JWT mid-probe (My applications Sign-in bounce).
  // Only an explicit ?next= query counts as a bounce (default next=/workspace
  // on bare /login must still purge immediately for guests).
  // remint57 / Mode A sign-in grace: always skip purge once isAuthenticated —
  // bare /login post-login re-fires this effect after login() clears
  // loginInFlight; purging then wipes mid-navigate → Suspense Loading → /login.
  useEffect(() => {
    if (isAuthenticated) return
    const bouncedToWorkspace = Boolean(nextParam?.startsWith('/workspace'))
    if (bouncedToWorkspace) {
      if (!authReady) return
      // L02: RequireAuth bounce must not POST /logout while /me is still verifying.
      if (readAuthToken()) return
    }
    void purgeLocalIdentity()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, isAuthenticated, nextParam])

  useEffect(() => {
    void (isSupabaseMode ? supabaseBootstrapNeeded() : apiAuthBootstrapNeeded()).then(setBootstrapNeeded)
  }, [])

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('pf-register-email')
      if (saved) {
        setEmail(saved)
        sessionStorage.removeItem('pf-register-email')
      }
    } catch {
      /* ignore */
    }
  }, [])

  if (authReady && isAuthenticated) {
    return <Navigate to={resolvePostLoginPath(user.role, next)} replace />
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const trimmedEmail = email.trim()
      const appUser = await login(trimmedEmail, password)

      if (isSupabaseMode) {
        const pending = readPendingRegistrationDocs(trimmedEmail)
        if (pending?.documents.length) {
          const { data: { session } } = await createClient().auth.getSession()
          if (session?.user?.id) {
            try {
              await supabaseAttachPendingRegistrationDocs({
                authUserId: session.user.id,
                role: pending.role,
                profile: pending.profile,
                documents: pending.documents,
              })
            } catch {
              /* docs can be re-submitted from profile later */
            }
            clearPendingRegistrationDocs()
          }
        }
      }

      navigate(resolvePostLoginPath(appUser.role, next), { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed'
      // P0-2: explicit, retryable error — never a hung navigation.
      const friendly =
        /timed out|failed to fetch|networkerror|load failed/i.test(msg)
          ? 'Connection timed out while signing in. Check your internet and try again — your account was not locked out.'
          : msg
      await showAuthError(friendly)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your workspace, landlord portfolio, or applicant applications."
      crossLink={{ to: `/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`, label: 'Create account' }}
      asideTitle="Manage property with clarity"
      asideBody="One place for agencies, landlords, and applicants — from listing to lease."
      asidePoints={[
        'Secure email and password sign-in',
        'Role-based workspaces for every actor',
        'Listings live on the public marketplace',
      ]}
      bootstrapBanner={
        registered === 'confirm-email' ? (
          <p className="mt-4 flex items-start gap-2.5 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-ink-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
            <span>
              Account created — check your email to confirm, then sign in below.
            </span>
          </p>
        ) : registered === 'ready' ? (
          <p className="mt-4 flex items-start gap-2.5 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-ink-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
            <span>
              Account created — a welcome email is on its way to your inbox. Sign
              in below with the email and password you registered.
            </span>
          </p>
        ) : bootstrapNeeded ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            No users yet —{' '}
            <Link to="/register" className="font-semibold underline">
              register the first Super Admin
            </Link>
            .
          </p>
        ) : null
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <AuthField label="Email address" htmlFor="login-email">
          <Input
            id="login-email"
            className="min-h-11"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </AuthField>
        <AuthField label="Password" htmlFor="login-password">
          <PasswordField
            id="login-password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />
        </AuthField>
        <Button type="submit" className="min-h-11 w-full cursor-pointer" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
