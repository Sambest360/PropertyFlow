import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { AuthField, AuthShell } from '../../components/auth/AuthShell'
import { PasswordField } from '../../components/auth/PasswordField'
import { Button } from '../../components/ui'
import { setPasswordWithToken } from '../../lib/api/accountEmailApi'
import { MIN_PASSWORD_LENGTH } from '../../lib/auth/passwordPolicy'

/** Used by both /reset-password (forgot password) and /set-password (new account or staff reset). */
export default function SetPasswordPage({ mode }: { mode: 'reset' | 'setup' }) {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const title = mode === 'setup' ? 'Choose your password' : 'Choose a new password'
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true)
    try {
      const r = await setPasswordWithToken(token, password)
      setDone(r.email)
      try {
        sessionStorage.setItem('pf-register-email', r.email)
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={title}
      subtitle={mode === 'setup' ? 'Finish setting up your Lekaya Rentals account.' : 'Pick something you do not use anywhere else.'}
      crossLink={{ to: '/login', label: 'Sign in' }}
      asideTitle="Your account, your password"
      asideBody="Only you know it — we never send passwords by email."
      asidePoints={[`At least ${MIN_PASSWORD_LENGTH} characters`, 'Other devices are signed out', 'You can change it any time in Settings']}
    >
      {!token ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          This link is missing its code. Open the link from your email again, or{' '}
          <Link to="/forgot-password" className="font-semibold underline">ask for a new one</Link>.
        </p>
      ) : done ? (
        <div className="rounded-2xl border border-primary-200 bg-primary-50 p-5 text-sm text-ink-700" role="status">
          <CheckCircle2 className="mb-2 h-6 w-6 text-primary" strokeWidth={1.6} aria-hidden />
          <p className="font-semibold text-ink">Password saved</p>
          <p className="mt-1">You can now sign in as <strong>{done}</strong>.</p>
          <Button className="mt-4 min-h-11 w-full cursor-pointer" onClick={() => navigate('/login', { replace: true })}>
            Go to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <AuthField label="New password" htmlFor="set-password">
            <PasswordField id="set-password" value={password} onChange={setPassword} autoComplete="new-password" required />
          </AuthField>
          <AuthField label="Type it again" htmlFor="set-password-confirm">
            <PasswordField id="set-password-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" required />
          </AuthField>
          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}{' '}
              {/expired|already used|not valid/i.test(error) ? (
                <Link to="/forgot-password" className="font-semibold underline">Get a new link</Link>
              ) : null}
            </p>
          ) : null}
          <Button type="submit" className="min-h-11 w-full cursor-pointer" disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
