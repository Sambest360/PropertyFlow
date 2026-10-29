import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { AuthField, AuthShell } from '../../components/auth/AuthShell'
import { Button, Input } from '../../components/ui'
import { requestPasswordReset } from '../../lib/api/accountEmailApi'

const ASIDE = {
  asideTitle: 'Back into your account',
  asideBody: 'We will email you a secure link to choose a new password.',
  asidePoints: ['The link works once', 'It expires after 1 hour', 'We never email passwords'],
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await requestPasswordReset(email.trim())
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the email. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter the email you sign in with." crossLink={{ to: '/login', label: 'Back to sign in' }} {...ASIDE}>
      {sent ? (
        <div className="rounded-2xl border border-primary-200 bg-primary-50 p-5 text-sm text-ink-700" role="status">
          <MailCheck className="mb-2 h-6 w-6 text-primary" strokeWidth={1.6} aria-hidden />
          <p className="font-semibold text-ink">Check your inbox</p>
          <p className="mt-1">
            If <strong>{email.trim()}</strong> has a Lekaya Rentals account, a link to reset your password is on its way. It expires in 1 hour.
          </p>
          <p className="mt-3">
            Nothing after a few minutes? Check your spam folder, or{' '}
            <button type="button" className="cursor-pointer font-semibold text-primary underline" onClick={() => setSent(false)}>
              try again
            </button>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <AuthField label="Email address" htmlFor="forgot-email">
            <Input id="forgot-email" className="min-h-11" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </AuthField>
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
          <Button type="submit" className="min-h-11 w-full cursor-pointer" disabled={busy}>
            {busy ? 'Sending…' : 'Email me a reset link'}
          </Button>
          <p className="text-center text-sm text-ink-500">
            Remembered it? <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}
