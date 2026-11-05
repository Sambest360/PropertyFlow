import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Tenancy } from '../../types/domain'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { Button, Modal, Textarea } from '../ui'
import { sweetSuccess } from '../../lib/sweetAlert'

/** Remove a tenant from a property: a clear warning plus an optional reason. */
export function RemoveTenantDialog({ tenancy, onClose, onRemoved }: { tenancy: Tenancy | null; onClose: () => void; onRemoved?: () => void }) {
  const { removeTenantFromProperty } = useStore()
  const { user } = useAuth()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!tenancy) return null
  const close = () => {
    setReason('')
    setError('')
    onClose()
  }
  const remove = async () => {
    setBusy(true)
    const res = await removeTenantFromProperty(tenancy.id, { reason, actor: { userId: user.id, name: user.name } })
    setBusy(false)
    if (!res.ok) return setError(res.error ?? 'Could not remove the tenant.')
    await sweetSuccess('Tenant removed', `${tenancy.tenantName}'s tenancy has ended today.`)
    close()
    onRemoved?.()
  }
  return (
    <Modal open onClose={close} title={`Remove ${tenancy.tenantName}?`}>
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-950" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            Removing this tenant ends their tenancy today. If they still have a lease, removing them may break the lease agreement or the Rental Housing
            Act notice rules. Make sure you are allowed to do this, and handle their deposit separately.
          </p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-ink-500">Reason (optional)</span>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Tenant moved out at the end of the lease." />
        </label>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Removing…' : 'Remove tenant'}</Button>
        </div>
      </div>
    </Modal>
  )
}
