import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { AuthShell } from '../../components/auth/AuthShell'
import { Button } from '../../components/ui'
import { confirmEmailChange } from '../../lib/api/accountEmailApi'
import { useAuth } from '../../context/AuthContext'

/** The link an admin's email change sends to the new address (server/emailChange.ts). */
export default function ConfirmEmailChangePage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    if (!token) {
      setState('failed')
      setMessage('This link is missing its code.')
      return
    }
    confirmEmailChange(token)
      .then((r) => {
        setEmail(r.email)
        setState('done')
      })
      .catch((err) => {
        setState('failed')
        setMessage(err instanceof Error ? err.message : 'This link did not work.')
      })
  }, [token])

  return (
    <AuthShell
      title="Confirm your new email"
      subtitle="Your sign-in email changes once you confirm it."
      crossLink={{ to: isAuthenticated ? '/workspace' : '/login', label: isAuthenticated ? 'Go to my dashboard' : 'Sign in' }}
      asideTitle="Keeping your account yours"
      asideBody="A sign-in email only changes after the new inbox confirms it."
      asidePoints={['Your password stays the same', 'Your old address was told about the change']}
    >
      {state === 'working' ? (
        <p className="text-sm text-ink-600" role="status">Confirming your new email…</p>
      ) : state === 'done' ? (
        <div className="rounded-2xl border border-primary-200 bg-primary-50 p-5 text-sm text-ink-700" role="status">
          <CheckCircle2 className="mb-2 h-6 w-6 text-primary" strokeWidth={1.6} aria-hidden />
          <p className="font-semibold text-ink">Email changed</p>
          <p className="mt-1">
            From now on, sign in with <strong>{email}</strong>. Your password has not changed.
          </p>
          <Link to={isAuthenticated ? '/workspace' : '/login'}>
            <Button className="mt-4 min-h-11 w-full cursor-pointer">{isAuthenticated ? 'Go to my dashboard' : 'Sign in'}</Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" role="alert">
          <XCircle className="mb-2 h-6 w-6" strokeWidth={1.6} aria-hidden />
          <p className="font-semibold">We could not confirm this link</p>
          <p className="mt-1">{message}</p>
          <p className="mt-2">Ask your administrator to send a new one.</p>
        </div>
      )}
    </AuthShell>
  )
}
