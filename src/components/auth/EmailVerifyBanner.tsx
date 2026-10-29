import { useState } from 'react'
import { MailWarning, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { resendVerificationEmail } from '../../lib/api/accountEmailApi'

/** Shown in the workspace until a self-registered account confirms its email. */
export function EmailVerifyBanner() {
  const { isAuthenticated, emailVerified, isImpersonating, user } = useAuth()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [hidden, setHidden] = useState(false)
  if (!isAuthenticated || emailVerified || isImpersonating || hidden) return null

  const resend = async () => {
    setState('sending')
    try {
      const r = await resendVerificationEmail()
      setState('sent')
      setMsg(r.alreadyVerified ? 'Your email is already confirmed — refresh the page.' : `New link sent to ${user.email}.`)
    } catch (err) {
      setState('error')
      setMsg(err instanceof Error ? err.message : 'Could not send the link.')
    }
  }

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      <MailWarning className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.6} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Please confirm your email address</p>
        <p className="mt-0.5">
          We sent a link to <strong>{user.email}</strong>. Click it to confirm — it keeps your account safe and makes sure you get updates.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="cursor-pointer rounded-lg bg-white px-3 py-1.5 font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100 disabled:opacity-60"
            onClick={() => void resend()}
            disabled={state === 'sending'}
          >
            {state === 'sending' ? 'Sending…' : 'Send a new link'}
          </button>
          {msg ? <span>{msg}</span> : null}
        </div>
      </div>
      <button type="button" className="cursor-pointer rounded p-1 hover:bg-amber-100" onClick={() => setHidden(true)} aria-label="Hide for now">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
