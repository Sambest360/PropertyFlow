import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { AuthError, AuthField, AuthShell } from '../../components/auth/AuthShell'
import { PasswordField } from '../../components/auth/PasswordField'
import { Button, Input } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { apiAuthBootstrapNeeded } from '../../lib/api/authClient'
import { supabaseBootstrapNeeded } from '../../lib/supabase/auth.js'
import { isSupabaseMode } from '../../lib/api/config'

const ICON_STROKE = 1.6

export default function LoginPage() {
  const { login, isAuthenticated, authReady } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const next = params.get('next') || (location.state as { from?: string } | null)?.from || '/workspace'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [bootstrapNeeded, setBootstrapNeeded] = useState(false)
  const registered = params.get('registered')

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
    return <Navigate to={next} replace />
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate(next, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
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
            <span>Your account is ready — sign in with the email and password you created.</span>
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
        <AuthError message={error} />
        <Button type="submit" className="min-h-11 w-full cursor-pointer" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
