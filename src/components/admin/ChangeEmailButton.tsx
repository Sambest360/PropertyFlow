import { useState } from 'react'
import { Button, Modal } from '../ui'
import { requestUserEmailChange } from '../../lib/api/accountEmailApi'

/**
 * Staff change a user's sign-in email. Nothing changes until the person uses
 * the confirmation link sent to the new address (server/emailChange.ts), so a
 * typo can never lock them out. Same visibility as "Change password"; the
 * server is the gate.
 */
export function ChangeEmailButton({
  userId,
  userName,
  currentEmail,
}: {
  userId: string
  userName: string
  currentEmail: string
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ pendingEmail: string; emailSent: boolean } | null>(null)

  const close = () => {
    setOpen(false)
    setEmail('')
    setError(null)
    setDone(null)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await requestUserEmailChange(userId, email.trim())
      setDone({ pendingEmail: r.pendingEmail, emailSent: r.emailSent })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The email could not be changed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Change email
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={done ? 'Confirmation sent' : `Change ${userName}’s email`}
        footer={
          done ? (
            <Button type="button" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void submit()} disabled={busy || !email.trim()}>
                {busy ? 'Sending…' : 'Send confirmation'}
              </Button>
            </>
          )
        }
      >
        {done ? (
          <div className="space-y-3 text-sm text-ink-700" role="status">
            <p>
              We sent a confirmation link to <strong>{done.pendingEmail}</strong>. {userName} keeps signing in with{' '}
              <strong>{currentEmail}</strong> until that link is used, and the current address got a notice.
            </p>
            {!done.emailSent ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900" role="alert">
                Email isn&rsquo;t set up on the server, so the confirmation could not actually be sent. Set up an email
                provider, then try again.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3 text-sm text-ink-700">
            <p>
              Current sign-in email: <strong>{currentEmail}</strong>
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-ink-600">New email address</span>
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-primary-100 px-3 text-sm"
              />
            </label>
            <p className="text-xs text-ink-500">
              The change only applies once it is confirmed from the new address.
            </p>
            {error ? (
              <p role="alert" className="text-red-600">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  )
}
