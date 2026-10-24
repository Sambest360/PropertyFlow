import { useState } from 'react'
import { Badge, Button, Card } from '../ui'
import { authHeaders } from '../../lib/api/authClient'
import { availableFromLabel } from '../../lib/availableFromLabel'
import { POPIA_PHOTO_WARNING } from '../../lib/occupiedAdvert'
import type { PropertyAsset, Tenancy } from '../../types/domain'

export function OccupiedAdvertCard({
  property,
  tenancy,
}: {
  property: PropertyAsset
  tenancy: Tenancy | null
}) {
  const [enabled, setEnabled] = useState(Boolean(property.advertiseWhileOccupied))
  const [availableFrom, setAvailableFrom] = useState(property.availableFrom ?? '')
  const [reason, setReason] = useState('')
  const [expected, setExpected] = useState('')
  const [note, setNote] = useState('')
  const [photoMode, setPhotoMode] = useState<'CURRENT' | 'PRE_OCCUPATION'>('CURRENT')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Month-to-month with no notice: the agent must give a date and a reason.
  const needsExpected = !tenancy?.endDate && tenancy?.leaseStatus !== 'notice'
  const missingExpected = needsExpected && !enabled && (!expected || !note.trim())

  const leaseReason = tenancy?.endDate
    ? `Lease ends ${availableFromLabel(tenancy.endDate).replace('Available from ', '')}`
    : 'Month-to-month — enter the date you expect the home to be free'

  async function save(next: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/units/${encodeURIComponent(property.backendId ?? property.id)}/advertise-while-occupied`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          enabled: next,
          expectedAvailableFrom: expected || null,
          reason: note || null,
          photoMode,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        message?: string
        availableFrom?: string | null
        reason?: string | null
        advertiseWhileOccupied?: boolean
      }
      if (!res.ok) {
        setError(body.message ?? 'Could not update the listing')
        return
      }
      setEnabled(Boolean(body.advertiseWhileOccupied))
      setAvailableFrom(body.availableFrom ?? '')
      setReason(body.reason ?? '')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-5 space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Advertise while occupied</h2>
          <p className="text-sm text-ink-500">{reason || leaseReason}</p>
        </div>
        {availableFrom ? <Badge tone="brand">{availableFromLabel(availableFrom)}</Badge> : null}
      </div>
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{POPIA_PHOTO_WARNING}</p>
      <label className="flex items-center gap-2 text-sm text-ink-600">
        <input
          type="checkbox"
          checked={photoMode === 'PRE_OCCUPATION'}
          onChange={(e) => setPhotoMode(e.target.checked ? 'PRE_OCCUPATION' : 'CURRENT')}
        />
        Use pre-occupation photos
      </label>
      {needsExpected && !enabled && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="date"
            className="h-11 rounded-xl border border-primary-100 px-3 text-sm"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            aria-label="Expected available date"
          />
          <input
            className="h-11 rounded-xl border border-primary-100 px-3 text-sm"
            placeholder="Reason for the expected date"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {missingExpected ? (
        <p className="text-xs text-ink-500">Enter the expected available date and the reason to advertise.</p>
      ) : null}
      <Button type="button" className="min-h-11" disabled={busy || missingExpected} onClick={() => save(!enabled)}>
        {busy ? 'Saving…' : enabled ? 'Stop advertising' : 'Advertise while occupied'}
      </Button>
    </Card>
  )
}
