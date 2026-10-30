import { useState } from 'react'
import { Button, Modal } from '../ui'
import { deleteUserAccount } from '../../lib/api/accountEmailApi'

/**
 * Super admin only (the server checks). Removes the user, or, when leases,
 * payments or other records point at them, wipes their personal details and
 * disables the account so those records stay intact (server/userDelete.ts).
 */
export function DeleteUserButton({
  userId,
  userName,
  onDeleted,
}: {
  userId: string
  userName: string
  onDeleted: (mode: 'deleted' | 'anonymised') => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await deleteUserAccount(userId)
      setOpen(false)
      onDeleted(r.mode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The user could not be deleted.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
        Delete user
      </Button>
      <Modal
        open={open}
        onClose={() => (busy ? undefined : setOpen(false))}
        title={`Delete ${userName}?`}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={() => void run()} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete user'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-700">
          <p>This signs {userName} out and removes their access. It cannot be undone.</p>
          <p className="text-ink-500">
            If leases, payments, applications or other records point at this user, those records are kept and the
            account is anonymised instead: name, email, phone and password are wiped and it can no longer sign in.
          </p>
          {error ? (
            <p role="alert" className="text-red-600">
              {error}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
