import { useState } from 'react'
import { KeyRound, MailCheck } from 'lucide-react'
import { Button } from '../ui'
import { TempPasswordModal } from './ResetPasswordButton'
import { apiResetPassword } from '../../lib/api/authClient'
import { sendUserConfirmation } from '../../lib/api/accountEmailApi'
import { sweetSuccess, sweetWarning } from '../../lib/sweetAlert'
import type { AppUser } from '../../types/domain'

/**
 * Super admin one-click actions for an account: send the confirm-your-email
 * link again, and reset the password (a temporary one is emailed and must be
 * changed at the next sign-in). The server checks the role; this only shows
 * the buttons. Not offered on super admin accounts (their password cannot be
 * reset here) or your own.
 */
export function SuperAdminQuickActions({
  user,
  viewerId,
  compact = false,
  showReset = true,
}: {
  user: Pick<AppUser, 'id' | 'name' | 'role'>
  viewerId: string
  compact?: boolean
  /** False where a "Change password" button is already shown. */
  showReset?: boolean
}) {
  const [busy, setBusy] = useState<'confirm' | 'reset' | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  if (user.id === viewerId) return null

  const confirm = async () => {
    setBusy('confirm')
    try {
      const r = await sendUserConfirmation(user.id)
      if (r.sent) await sweetSuccess('Confirmation sent', `${user.name} got a link to confirm their email address.`)
      else await sweetWarning('Not sent', 'Email isn’t set up on the server, so the link could not be sent.')
    } catch (err) {
      await sweetWarning('Not sent', err instanceof Error ? err.message : 'The email could not be sent.')
    } finally {
      setBusy(null)
    }
  }

  const reset = async () => {
    setBusy('reset')
    try {
      const r = await apiResetPassword(user.id)
      setTempPassword(r.tempPassword)
    } catch (err) {
      await sweetWarning('Password not reset', err instanceof Error ? err.message : 'The password could not be reset.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="shrink-0"
        onClick={() => void confirm()}
        disabled={busy !== null}
        title={`Email ${user.name} a link to confirm their email address`}
        aria-label={`Resend email confirmation to ${user.name}`}
      >
        <MailCheck className="h-4 w-4" strokeWidth={1.6} aria-hidden />
        {compact ? null : busy === 'confirm' ? 'Sending…' : 'Resend confirmation'}
      </Button>
      {showReset && user.role !== 'super_admin' ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => void reset()}
          disabled={busy !== null}
          title={`Reset ${user.name}’s password and email them a temporary one`}
          aria-label={`Reset password for ${user.name}`}
        >
          <KeyRound className="h-4 w-4" strokeWidth={1.6} aria-hidden />
          {compact ? null : busy === 'reset' ? 'Resetting…' : 'Reset password'}
        </Button>
      ) : null}
      <TempPasswordModal
        emailed
        title={`${user.name}: temporary password`}
        tempPassword={tempPassword}
        onClose={() => setTempPassword(null)}
      />
    </>
  )
}
