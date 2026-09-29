import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { AuthField, AuthShell } from '../../components/auth/AuthShell'
import { Button, Input } from '../../components/ui'
import { supabaseResetPasswordForEmail } from '../../lib/supabase/auth'
import { isSupabaseConfigured } from '../../utils/supabase/env'
import { showAuthError } from '../../lib/sweetAlert'

const ICON_STROKE = 1.6

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isSupabaseConfigured()) {
      await showAuthError('Password reset is unavailable until sign-in is configured.')
      return
    }
    setBusy(true)
    try {
      await supabaseResetPasswordForEmail(email)
      setSent(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not send the reset email'
      await showAuthError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Reset password"
      subtitle="We’ll email you a link to choose a new password."
      crossLink={{ to: '/login', label: 'Back to sign in' }}
      asideTitle="Back into your workspace"
      asideBody="Use the email on your account. The link opens a page where you set a new password."
      asidePoints={[
        'The link expires after a short time',
        'Your current password keeps working until you change it',
        'Staff invites and applications stay on your account',
      ]}
    >
      {sent ? (
        <p className="flex items-start gap-2.5 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-ink-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
          <span>
            Check {email.trim()} for a reset link. Open it on this device, then choose a new password.
          </span>
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <AuthField label="Email address" htmlFor="reset-email">
            <Input
              id="reset-email"
              className="min-h-11"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </AuthField>
          <Button type="submit" className="min-h-11 w-full cursor-pointer" disabled={busy}>
            {busy ? 'Sending…' : 'Email reset link'}
          </Button>
          <p className="text-center text-sm text-ink-500">
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Return to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}
