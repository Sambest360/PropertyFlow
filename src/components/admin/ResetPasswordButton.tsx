import { useState } from 'react'
import { Button, Modal } from '../ui'
import { apiResetPassword } from '../../lib/api/authClient'
import { MIN_PASSWORD_LENGTH } from '../../lib/auth/passwordPolicy'

export const TEMP_PASSWORD_HANDOFF_NOTE =
  'Send this password to the user privately (a direct call or message). Don\u2019t post it in a group chat.'

/** New accounts: the welcome email already carries the temporary password. */
export const TEMP_PASSWORD_EMAILED_NOTE =
  'We\u2019ve emailed this temporary password to the user with their sign-in details. Keep it only as a backup in case the email doesn\u2019t arrive.'

/**
 * One-time temp password view (reset and staff create). The password lives only
 * in the caller's state while open; onClose must drop it.
 */
export function TempPasswordModal({
  tempPassword,
  onClose,
  title = 'Temporary password',
  emailed = false,
}: {
  tempPassword: string | null
  onClose: () => void
  title?: string
  /** True for a new account: its welcome email already carries this password. */
  emailed?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const close = () => {
    setCopied(false)
    onClose()
  }
  const copy = async () => {
    if (!tempPassword) return
    try {
      await navigator.clipboard.writeText(tempPassword)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Modal
      open={Boolean(tempPassword)}
      onClose={close}
      title={title}
      footer={
        <Button type="button" onClick={close}>
          Done
        </Button>
      }
    >
      <TempPasswordBody tempPassword={tempPassword ?? ''} copied={copied} onCopy={() => void copy()} emailed={emailed} />
    </Modal>
  )
}

function TempPasswordBody({
  tempPassword,
  copied,
  onCopy,
  emailed,
}: {
  tempPassword: string
  copied: boolean
  onCopy: () => void
  emailed?: boolean
}) {
  return (
    <div className="space-y-3 text-sm text-ink-700">
      <p>
        {emailed
          ? 'The user must change this temporary password at first sign-in.'
          : 'Give this temporary password to the user. They must change it at next sign-in.'}
      </p>
      <div className="flex items-center gap-2">
        <code
          data-testid="temp-password"
          className="flex-1 select-all rounded-lg bg-ink-50 px-3 py-2 font-mono text-base tracking-wider text-ink-900"
        >
          {tempPassword}
        </code>
        <Button type="button" variant="secondary" size="sm" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="font-medium">{emailed ? TEMP_PASSWORD_EMAILED_NOTE : TEMP_PASSWORD_HANDOFF_NOTE}</p>
      <p className="text-ink-500">It won&rsquo;t be shown again.</p>
    </div>
  )
}

/**
 * D3 staff reset. The temp password lives only in this component's state while
 * the modal is open and is dropped on close; it is never written to storage.
 * Callers show this only with users.manage; the server is the real gate.
 */
export function ResetPasswordButton({
  userId,
  userName,
  size = 'sm',
}: {
  userId: string
  userName: string
  size?: 'sm' | 'md'
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [chosen, setChosen] = useState('')
  const [copied, setCopied] = useState(false)

  const close = () => {
    setTempPassword(null)
    setChosen('')
    setConfirming(false)
    setCopied(false)
    setError(null)
  }

  const run = async () => {
    const typed = chosen.trim()
    if (typed && typed.length < MIN_PASSWORD_LENGTH) {
      setError(`A temporary password needs at least ${MIN_PASSWORD_LENGTH} characters, or leave it blank to generate one.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await apiResetPassword(userId, typed || undefined)
      setTempPassword(res.tempPassword)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The password could not be reset.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!tempPassword) return
    try {
      await navigator.clipboard.writeText(tempPassword)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size={size} onClick={() => setConfirming(true)}>
        Change password
      </Button>
      <Modal
        open={confirming}
        onClose={close}
        title={tempPassword ? 'Temporary password' : `Change ${userName}\u2019s password`}
        footer={
          tempPassword ? (
            <Button type="button" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={() => void run()} disabled={busy}>
                {busy ? 'Saving…' : 'Set temporary password'}
              </Button>
            </>
          )
        }
      >
        {tempPassword ? (
          <div className="space-y-2">
            <TempPasswordBody tempPassword={tempPassword} copied={copied} onCopy={() => void copy()} emailed />
            <p className="text-sm text-ink-500">Their other sign-ins have been ended.</p>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-ink-700">
            <p>
              This signs {userName} out everywhere and emails them a temporary password. They will have
              to choose their own password when they next sign in.
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-ink-600">Temporary password (optional)</span>
              <input
                type="text"
                autoComplete="off"
                value={chosen}
                onChange={(e) => setChosen(e.target.value)}
                placeholder="Leave blank to generate one"
                className="min-h-11 w-full rounded-lg border border-primary-100 px-3 text-sm"
              />
              <span className="block text-xs text-ink-500">At least {MIN_PASSWORD_LENGTH} characters.</span>
            </label>
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
