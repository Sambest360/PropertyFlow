import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthField, AuthShell } from '../../components/auth/AuthShell'
import { PasswordField } from '../../components/auth/PasswordField'
import { Button } from '../../components/ui'
import { passwordMeetsPolicy } from '../../lib/auth/passwordStrength'
import { supabaseUpdatePassword } from '../../lib/supabase/auth'
import { showAuthError, sweetSuccess } from '../../lib/sweetAlert'
import { createClient } from '../../utils/supabase/client'
import { isSupabaseConfigured } from '../../utils/supabase/env'

export default function UpdatePasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setReady(true)
      return
    }
    const supabase = createClient()
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setHasSession(Boolean(data.session))
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || session) {
        setHasSession(Boolean(session))
        setReady(true)
      }
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const policy = passwordMeetsPolicy(password)
    if (policy.ok === false) {
      await showAuthError(policy.message)
      return
    }
    if (password !== confirm) {
      await showAuthError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await supabaseUpdatePassword(password)
      await sweetSuccess('Password updated', 'You can continue into your workspace.')
      navigate('/workspace', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update the password'
      await showAuthError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="This page opens from the reset link in your email."
      crossLink={{ to: '/forgot-password', label: 'Request a new link' }}
      asideTitle="Set a password you haven’t used here"
      asideBody="After you save it, you’ll go straight to your workspace."
      asidePoints={['At least 8 characters', 'Mix letters, numbers, and symbols', 'The reset link can only be used once']}
    >
      {!isSupabaseConfigured() ? (
        <p className="text-sm text-ink-600">Password reset is unavailable until sign-in is configured.</p>
      ) : !ready ? (
        <p className="text-sm text-ink-500" role="status">
          Checking your reset link…
        </p>
      ) : !hasSession ? (
        <p className="text-sm text-ink-600">
          This reset link is invalid or has expired. Request a new one and open it on this device.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <AuthField label="New password" htmlFor="update-password">
            <PasswordField
              id="update-password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              showStrength
              required
              minLength={8}
            />
          </AuthField>
          <AuthField label="Confirm password" htmlFor="update-password-confirm">
            <PasswordField
              id="update-password-confirm"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </AuthField>
          <Button type="submit" className="min-h-11 w-full cursor-pointer" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
