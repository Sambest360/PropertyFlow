import { useEffect, useState } from 'react'
import { Badge, Button, Card } from '../ui'
import { authHeaders } from '../../lib/api/authClient'
import { availableFromLabel } from '../../lib/availableFromLabel'
import type { PropertyAsset, Tenancy } from '../../types/domain'

type WindowRow = { weekday: number | null; windowDate: string | null; startTime: string; endTime: string }
/** Date and time only: the visitor's details stay with the agency (POPIA). */
type RequestRow = { id: string; startsAt: string; tenantConsentStatus: string }

function formatStartsAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // starts_at is SAST wall time labelled Z (app convention): show it as stored.
  return d.toLocaleString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

export function OccupiedHomeAdvertCard({
  tenancy,
  property,
}: {
  tenancy: Tenancy
  property: PropertyAsset | null
}) {
  const [windows, setWindows] = useState<WindowRow[]>([])
  const [weekday, setWeekday] = useState('6')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('12:00')
  const [message, setMessage] = useState<string | null>(null)
  const [proposedStartsAt, setProposedStartsAt] = useState('')
  const [pending, setPending] = useState<RequestRow[]>([])

  useEffect(() => {
    let cancelled = false
    void fetch(`/api/leases/${encodeURIComponent(tenancy.id)}/viewing-windows`, { headers: { ...authHeaders() } })
      .then((res) => res.json())
      .then((body: { windows?: WindowRow[] }) => {
        if (!cancelled && Array.isArray(body.windows)) setWindows(body.windows)
      })
      .catch(() => undefined)
    void fetch(`/api/leases/${encodeURIComponent(tenancy.id)}/viewing-requests`, { headers: { ...authHeaders() } })
      .then((res) => res.json())
      .then((body: { requests?: RequestRow[] }) => {
        if (!cancelled && Array.isArray(body.requests)) setPending(body.requests)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [tenancy.id])

  async function save() {
    const next = [...windows, { weekday: Number(weekday), windowDate: null, startTime, endTime }]
    const res = await fetch(`/api/leases/${encodeURIComponent(tenancy.id)}/viewing-windows`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ windows: next }),
    })
    const body = (await res.json().catch(() => ({}))) as { windows?: WindowRow[]; message?: string }
    if (!res.ok) {
      setMessage(body.message ?? 'Could not save windows')
      return
    }
    setWindows(body.windows ?? next)
    setMessage('Viewing windows saved')
  }

  async function respond(id: string, status: 'ACCEPTED' | 'DECLINED') {
    const res = await fetch(`/api/bookings/${encodeURIComponent(id)}/tenant-response`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        status,
        proposedStartsAt: status === 'DECLINED' && proposedStartsAt ? proposedStartsAt : null,
      }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string }
      setMessage(body.message ?? 'Could not save your answer')
      return
    }
    setPending((rows) => rows.filter((r) => r.id !== id))
    setMessage(status === 'ACCEPTED' ? 'Viewing accepted' : 'Viewing declined')
  }

  if (!property?.advertiseWhileOccupied) return null

  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">Your home is being advertised</h2>
        {property.availableFrom ? <Badge tone="brand">{availableFromLabel(property.availableFrom)}</Badge> : null}
      </div>
      <p className="text-sm text-ink-500">
        Choose when viewings can happen. Each request needs at least 24 hours’ notice. You can decline any time.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-500">
          Weekday
          <select className="mt-1 block h-11 rounded-xl border border-primary-100 px-2 text-sm" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, i) => (
              <option key={label} value={i}>{label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-500">
          From
          <input type="time" className="mt-1 block h-11 rounded-xl border border-primary-100 px-2 text-sm" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>
        <label className="text-xs text-ink-500">
          To
          <input type="time" className="mt-1 block h-11 rounded-xl border border-primary-100 px-2 text-sm" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </label>
        <Button type="button" className="min-h-11" onClick={() => void save()}>Add window</Button>
      </div>
      {windows.length > 0 && (
        <ul className="text-sm text-ink-600">
          {windows.map((w, i) => (
            <li key={`${w.weekday}-${w.startTime}-${i}`}>
              {w.windowDate ?? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][w.weekday ?? 0]} {w.startTime}–{w.endTime}
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <label className="block text-xs text-ink-500">
          Propose another time if you decline (optional)
          <input
            type="datetime-local"
            className="mt-1 block h-11 w-full rounded-xl border border-primary-100 px-2 text-sm"
            value={proposedStartsAt}
            onChange={(e) => setProposedStartsAt(e.target.value)}
          />
        </label>
      )}
      {pending.map((v) => (
        <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-100 px-3 py-2">
          <p className="text-sm">Viewing · {formatStartsAt(v.startsAt)}</p>
          <div className="flex gap-2">
            <Button type="button" className="min-h-11" onClick={() => void respond(v.id, 'ACCEPTED')}>Accept</Button>
            <Button type="button" variant="secondary" className="min-h-11" onClick={() => void respond(v.id, 'DECLINED')}>Decline</Button>
          </div>
        </div>
      ))}
      {message ? <p className="text-sm text-ink-500">{message}</p> : null}
    </Card>
  )
}
