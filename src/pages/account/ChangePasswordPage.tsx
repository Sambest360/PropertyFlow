import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '../../components/ui'
import { PasswordField } from '../../components/auth/PasswordField'
import { useAuth } from '../../context/AuthContext'
import { apiChangePassword } from '../../lib/api/authClient'

export const MIN_NEW_PASSWORD_LENGTH = 10

/** Client-side checks; the server re-checks length and the current password. */
export function validatePasswordChange(input: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}): string | null {
  if (!input.currentPassword) return 'Enter your current password.'
  if (input.newPassword.length < MIN_NEW_PASSWORD_LENGTH) {
    return `Your new password needs at least ${MIN_NEW_PASSWORD_LENGTH} characters.`
  }
  if (input.newPassword !== input.confirmPassword) return 'The new passwords don\u2019t match.'
  if (input.newPassword === input.currentPassword) {
    return 'Choose a new password that\u2019s different from your current one.'
  }
  return null
}

/**
 * D3: change your own password (Account -> Change password). With
 * `forced`, it is the only screen a session with mustChangePassword sees.
 */
export default function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  const { completePasswordChange, logout } = useAuth()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = validatePasswordChange({ currentPassword, newPassword, confirmPassword })
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await apiChangePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setDone(true)
      completePasswordChange()
      if (forced) navigate('/workspace', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your password could not be changed.')
    } finally {
      setBusy(false)
    }
  }

  const form = (
    <Card className="mx-auto w-full max-w-md p-6">
      <h1 className="text-xl font-semibold text-ink-900">
        {forced ? 'Choose a new password' : 'Change password'}
      </h1>
      <p className="mt-1 text-sm text-ink-500">
        {forced
          ? 'You signed in with a temporary password. Choose your own password to continue.'
          : `Use at least ${MIN_NEW_PASSWORD_LENGTH} characters.`}
      </p>
      <form className="mt-5 space-y-4" onSubmit={onSubmit} noValidate>
        <div>
          <label htmlFor="current-password" className="mb-1 block text-sm font-medium text-ink-700">
            {forced ? 'Temporary password' : 'Current password'}
          </label>
          <PasswordField
            id="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            required
          />
        </div>
        <div>
          <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-ink-700">
            New password
          </label>
          <PasswordField
            id="new-password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            minLength={MIN_NEW_PASSWORD_LENGTH}
            required
            showStrength
          />
        </div>
        <div>
          <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-ink-700">
            Confirm new password
          </label>
          <PasswordField
            id="confirm-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            minLength={MIN_NEW_PASSWORD_LENGTH}
            required
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        {done && !forced ? (
          <p role="status" className="text-sm text-emerald-700">
            Your password has been changed.
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </Button>
          {forced ? (
            <Button type="button" variant="ghost" onClick={() => void logout()}>
              Sign out
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  )

  if (forced) {
    return <div className="flex min-h-screen items-center justify-center bg-white p-4">{form}</div>
  }
  return <div className="p-4 sm:p-6">{form}</div>
}
