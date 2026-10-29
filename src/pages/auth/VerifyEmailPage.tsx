import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { AuthShell } from '../../components/auth/AuthShell'
import { Button } from '../../components/ui'
import { confirmEmail, resendVerificationEmail } from '../../lib/api/accountEmailApi'
import { useAuth } from '../../context/AuthContext'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working')
  const [message, setMessage] = useState('')
  const [resent, setResent] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    if (!token) {
      setState('failed')
      setMessage('This link is missing its code.')
      return
    }
    confirmEmail(token)
      .then(() => setState('done'))
      .catch((err) => {
        setState('failed')
        setMessage(err instanceof Error ? err.message : 'This link did not work.')
      })
  }, [token])

  const resend = async () => {
    try {
      const r = await resendVerificationEmail()
      setResent(r.alreadyVerified ? 'Your email is already confirmed.' : 'A new link is on its way.')
    } catch (err) {
      setResent(err instanceof Error ? err.message : 'Could not send a new link.')
    }
  }

  return (
    <AuthShell
      title="Confirm your email"
      subtitle="One click keeps your account safe."
      crossLink={{ to: isAuthenticated ? '/workspace' : '/login', label: isAuthenticated ? 'Go to my dashboard' : 'Sign in' }}
      asideTitle="Thanks for confirming"
      asideBody="Confirmed emails get booking, application and payment updates."
      asidePoints={['Updates arrive by email and in the app', 'Choose what you get in Settings']}
    >
      {state === 'working' ? (
        <p className="text-sm text-ink-600" role="status">Confirming your email…</p>
      ) : state === 'done' ? (
        <div className="rounded-2xl border border-primary-200 bg-primary-50 p-5 text-sm text-ink-700" role="status">
          <CheckCircle2 className="mb-2 h-6 w-6 text-primary" strokeWidth={1.6} aria-hidden />
          <p className="font-semibold text-ink">Email confirmed</p>
          <p className="mt-1">Thank you — your email address is confirmed.</p>
          <Link to={isAuthenticated ? '/workspace' : '/login'}>
            <Button className="mt-4 min-h-11 w-full cursor-pointer">{isAuthenticated ? 'Go to my dashboard' : 'Sign in'}</Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" role="alert">
          <XCircle className="mb-2 h-6 w-6" strokeWidth={1.6} aria-hidden />
          <p className="font-semibold">We could not confirm this link</p>
          <p className="mt-1">{message}</p>
          {isAuthenticated ? (
            <Button variant="secondary" className="mt-4 cursor-pointer" onClick={() => void resend()}>
              Send me a new link
            </Button>
          ) : (
            <p className="mt-3">Sign in and use “Send a new link” on your dashboard.</p>
          )}
          {resent ? <p className="mt-2 text-ink-700">{resent}</p> : null}
        </div>
      )}
    </AuthShell>
  )
}
