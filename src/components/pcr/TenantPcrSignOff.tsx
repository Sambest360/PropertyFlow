/**
 * Tenant portal: review the move-in (incoming) condition report the agent
 * filled in and sign it off before the lease. "I agree" checkbox + name, an
 * electronic signature under ECTA 25 of 2002 s13. The server keeps every other
 * part of the report as the agent saved it (applicantApplicationPolicy.ts).
 */
import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import type { Application } from '../../types/domain'
import { findInspection, softSignTenant, upsertInspectionOnApplication } from '../../lib/pcr'
import { Badge, Button, Card } from '../ui'

const LABEL: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  damaged: 'Damaged',
  missing: 'Missing',
  not_checked: 'Not checked',
}

export function TenantPcrSignOff({
  application,
  tenantName,
  tenantUserId,
  onSave,
}: {
  application: Application
  tenantName: string
  tenantUserId: string
  onSave: (patch: Partial<Application>) => void | Promise<unknown>
}) {
  const inspection = findInspection(application, 'incoming')
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!inspection) return null
  const ready = inspection.rooms.every((r) => r.items.every((i) => i.condition !== 'not_checked'))
  if (!ready && !inspection.tenantSignature) return null
  const flagged = inspection.rooms.flatMap((r) =>
    r.items.filter((i) => ['fair', 'poor', 'damaged', 'missing'].includes(i.condition)).map((i) => ({ room: r.name, item: i })),
  )

  const sign = async () => {
    setError('')
    if (!agree) return setError('Tick "I agree" to sign off.')
    const res = softSignTenant(inspection, { userId: tenantUserId, name: tenantName, method: 'in_app_ack' }, new Date().toISOString(), 'Tenant signed off in the tenant portal (I agree checkbox, ECTA s13).')
    if (res.ok === false) return setError(res.error)
    setBusy(true)
    try {
      await onSave({ pcrInspections: upsertInspectionOnApplication(application, res.inspection).pcrInspections })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your sign-off.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 p-4" data-testid="tenant-pcr-signoff">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 font-semibold text-ink">
          <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden /> Move-in condition report
        </h3>
        {inspection.tenantSignature ? (
          <Badge tone="success">Signed off {new Date(inspection.tenantSignature.signedAt).toLocaleDateString('en-ZA')}</Badge>
        ) : (
          <Badge tone="warning">Your sign-off needed</Badge>
        )}
      </div>
      <p className="text-sm text-ink-600">
        Your agent recorded the condition of the property before you move in. Check it: anything not listed here may be charged to your deposit when you
        move out. The move-out inspection is done when you leave.
      </p>
      {flagged.length ? (
        <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          {flagged.map(({ room, item }) => (
            <li key={item.id}>
              <span className="font-medium text-ink">{room} · {item.label}:</span> {LABEL[item.condition]}
              {item.notes ? <span className="text-ink-600"> — {item.notes}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-500">Every item was recorded in good or excellent condition.</p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-primary">See every room and item</summary>
        <div className="mt-2 space-y-2">
          {inspection.rooms.map((r) => (
            <div key={r.id}>
              <p className="font-semibold text-ink">{r.name}</p>
              <ul className="ml-4 list-disc text-ink-600">
                {r.items.map((i) => (
                  <li key={i.id}>
                    {i.label}: {LABEL[i.condition]}
                    {i.notes ? ` — ${i.notes}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
      {!inspection.tenantSignature ? (
        <div className="space-y-2 border-t border-primary-100 pt-3">
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              I agree that this report is a true record of the property's condition at move-in, and that ticking this box and tapping Sign off is my
              electronic signature ({tenantName}).
            </span>
          </label>
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
          <Button type="button" disabled={busy || !agree} onClick={() => void sign()}>
            {busy ? 'Saving…' : 'Sign off the condition report'}
          </Button>
          <p className="text-xs text-ink-500">Don't agree with something? Message your agent before signing.</p>
        </div>
      ) : null}
    </Card>
  )
}
