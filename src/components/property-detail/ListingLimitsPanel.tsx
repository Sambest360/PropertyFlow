import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Input } from '../ui'
import { isApiEnabled } from '../../lib/api/config'
import { authHeaders } from '../../lib/api/authClient'
import { LISTING_LIMITS_READ_ONLY_NOTE } from '../../lib/waitlistAccess'

type Person = { id: string; name: string; email: string; phone?: string | null }

type LimitsView = {
  enquiryCount: number
  viewingCount: number
  maxEnquiries: number | null
  maxViewings: number | null
  limitAction: 'CLOSE' | 'WAITLIST'
  showRemaining: boolean
  waitlist: Person[]
  waitlistedLeads: Person[]
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

function blankCap(v: number | null): string {
  return v == null ? '' : String(v)
}

function parseCap(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isInteger(n) && n >= 0 ? n : null
}

function counter(count: number, cap: number | null): string {
  return cap == null ? `${count} / unlimited` : `${count} / ${cap}`
}

export function ListingLimitsPanel({
  unitRef,
  backendId,
  viewerIsStaff = true,
}: {
  unitRef: string
  backendId?: string | null
  /** False for landlords: read-only counts; limit edits, resets, promotes and waitlist PII are staff-only. */
  viewerIsStaff?: boolean
}) {
  const [view, setView] = useState<LimitsView | null>(null)
  const [maxEnquiries, setMaxEnquiries] = useState('')
  const [maxViewings, setMaxViewings] = useState('')
  const [limitAction, setLimitAction] = useState<'CLOSE' | 'WAITLIST'>('WAITLIST')
  const [showRemaining, setShowRemaining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const unitId = backendId || unitRef

  const apply = useCallback((next: LimitsView) => {
    setView(next)
    setMaxEnquiries(blankCap(next.maxEnquiries))
    setMaxViewings(blankCap(next.maxViewings))
    setLimitAction(next.limitAction)
    setShowRemaining(next.showRemaining)
  }, [])

  const load = useCallback(async () => {
    setError(null)
    if (isApiEnabled) {
      const res = await fetch(`${API_BASE}/api/units/${encodeURIComponent(unitRef)}/listing-limits`, {
        headers: { ...authHeaders() },
      })
      const json = (await res.json()) as LimitsView & { message?: string }
      if (!res.ok) {
        setError(json.message || 'Could not load listing limits.')
        return
      }
      apply(json)
      return
    }
    setError('Listing limits need the server connection.')
  }, [apply, unitId, unitRef])

  useEffect(() => {
    void load().catch(() => setError('Could not load listing limits.'))
  }, [load])

  async function save() {
    setBusy(true)
    setError(null)
    const body = {
      maxEnquiries: parseCap(maxEnquiries),
      maxViewings: parseCap(maxViewings),
      limitAction,
      showRemaining,
    }
    try {
      if (isApiEnabled) {
        const res = await fetch(`${API_BASE}/api/units/${encodeURIComponent(unitRef)}/listing-limits`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const json = (await res.json()) as { message?: string }
          setError(json.message || 'Could not save limits.')
          return
        }
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function resetRound() {
    setBusy(true)
    setError(null)
    try {
      if (isApiEnabled) {
        const res = await fetch(`${API_BASE}/api/units/${encodeURIComponent(unitRef)}/listing-limits/reset`, {
          method: 'POST',
          headers: { ...authHeaders() },
        })
        if (!res.ok) {
          const json = (await res.json()) as { message?: string }
          setError(json.message || 'Could not reset counters.')
          return
        }
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function promote(kind: 'viewing' | 'lead', id: string) {
    setBusy(true)
    setError(null)
    try {
      if (isApiEnabled) {
        const path = kind === 'viewing' ? `/api/waitlist/${id}/promote` : `/api/leads/${id}/promote-waitlist`
        const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { ...authHeaders() } })
        if (!res.ok) {
          const json = (await res.json()) as { message?: string; error?: string }
          setError(json.error === 'LISTING_FULL' ? 'This listing is still full.' : json.message || 'Could not promote.')
          return
        }
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mb-4 space-y-4 p-4">
      <div>
        <h3 className="font-semibold text-ink">Listing limits</h3>
        <p className="text-xs text-ink-500">
          Blank caps use the agency default, or stay unlimited when the agency has none. Applies to rentals.
        </p>
      </div>
      {error ? <p className="text-sm text-accent">{error}</p> : null}
      {view ? (
        <>
          <p className="text-sm text-ink">
            Enquiries {counter(view.enquiryCount, view.maxEnquiries)} · Viewings{' '}
            {counter(view.viewingCount, view.maxViewings)}
          </p>
          {viewerIsStaff ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-ink-600">
                  Max enquiries
                  <Input className="mt-1" inputMode="numeric" value={maxEnquiries} onChange={(e) => setMaxEnquiries(e.target.value)} placeholder="Unlimited" />
                </label>
                <label className="text-xs font-medium text-ink-600">
                  Max viewings
                  <Input className="mt-1" inputMode="numeric" value={maxViewings} onChange={(e) => setMaxViewings(e.target.value)} placeholder="Unlimited" />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="limit-action"
                    checked={limitAction === 'WAITLIST'}
                    onChange={() => setLimitAction('WAITLIST')}
                  />
                  Waitlist when full
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="limit-action" checked={limitAction === 'CLOSE'} onChange={() => setLimitAction('CLOSE')} />
                  Close when full
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={showRemaining} onChange={(e) => setShowRemaining(e.target.checked)} />
                  Show spots left
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={busy} onClick={() => void save()}>
                  Save limits
                </Button>
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void resetRound()}>
                  Reset counters / reopen
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-500">{LISTING_LIMITS_READ_ONLY_NOTE}</p>
          )}
          <WaitlistList title="Viewing waitlist" people={view.waitlist} busy={busy} onPromote={viewerIsStaff ? (id) => void promote('viewing', id) : undefined} />
          <WaitlistList title="Enquiry waitlist" people={view.waitlistedLeads} busy={busy} onPromote={viewerIsStaff ? (id) => void promote('lead', id) : undefined} />
        </>
      ) : !error ? (
        <p className="text-sm text-ink-500">Loading limits…</p>
      ) : null}
    </Card>
  )
}

export function WaitlistList({
  title,
  people,
  busy,
  onPromote,
}: {
  title: string
  people: Person[]
  busy: boolean
  /** Omitted for landlords: promoting is staff-only. */
  onPromote?: (id: string) => void
}) {
  if (people.length === 0) return null
  return (
    <div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <ul className="mt-2 space-y-2">
        {people.map((person) => (
          <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {person.name} · {person.email}
            </span>
            {onPromote ? (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onPromote(person.id)}>
                Promote
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
