/**
 * Super admin: listings waiting to go live. Agencies and landlords cannot
 * publish on their own; their listings wait here (server/listingApprovals.ts).
 * Approve makes the listing live; Decline needs a reason, which the agency sees.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgeCheck, EyeOff, RefreshCw, XCircle } from 'lucide-react'
import { actorHeaders } from '../../lib/api/actorAuth'
import { resolveApiAuthorizationHeader } from '../../lib/api/authClient'
import { Badge, Button, Card, PageHeader, Select, Textarea } from '../../components/ui'
import { sweetConfirm, sweetSuccess, sweetWarning } from '../../lib/sweetAlert'
import { relativeAge } from '../../lib/relativeTime'
import { Pager, usePaged } from '../../components/Pager'
import { useAuth } from '../../context/AuthContext'
import { canChangeListingLiveStatus } from '../../lib/listingLiveStatus'

type Item = {
  unitId: string
  status: 'pending' | 'approved' | 'declined' | 'withdrawn'
  requestedAt: string
  reviewedAt: string | null
  note: string | null
  title: string | null
  rent: number | null
  price: number | null
  listingType: string | null
  images: unknown
  address: string | null
  agency: string | null
  agencyId: string | null
  requestedBy: string | null
}

type BulkRow = { id: string; ok: boolean; status?: string; skipped?: string; error?: string; code?: string }
type BulkResponse = { results: BulkRow[]; summary: { requested: number; ok: number; skipped: number; failed: number }; remainingPending?: number }

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...(await resolveApiAuthorizationHeader()) },
  })
  const body = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`)
  return body
}

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images) || !images.length) return null
  const x = images[0] as unknown
  if (typeof x === 'string') return x
  if (x && typeof x === 'object' && typeof (x as { url?: unknown }).url === 'string') return (x as { url: string }).url
  return null
}

export default function ListingApprovalsPage() {
  // P4: only the owner approves or declines; Administrators see the queue read-only.
  const { user } = useAuth()
  const isOwner = canChangeListingLiveStatus(user)
  const [status, setStatus] = useState<'pending' | 'approved' | 'declined' | 'withdrawn' | 'all'>('pending')
  const [agencyFilter, setAgencyFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [lastRun, setLastRun] = useState<{ action: string; res: BulkResponse; titles: Record<string, string> } | null>(null)
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')
  const [declining, setDeclining] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    setError('')
    api<{ items: Item[] }>(`/api/admin/listing-approvals?status=${status}`)
      .then((r) => {
        setItems(r.items)
        setSelected(new Set())
      })
      .catch((e: Error) => setError(e.message))
  }, [status])
  useEffect(() => load(), [load])

  const decide = async (unitId: string, decision: 'approve' | 'decline' | 'withdraw', note = '') => {
    setBusy(unitId)
    try {
      await api(`/api/admin/listing-approvals/${unitId}`, { method: 'POST', body: JSON.stringify({ decision, note }) })
      await sweetSuccess(
        decision === 'approve' ? 'Approved — the listing is live' : decision === 'withdraw' ? 'Taken down' : 'Declined',
        decision === 'approve' ? '' : decision === 'withdraw' ? 'It is hidden from the public site. The agency has been told.' : 'The agency has been told why.',
      )
      setDeclining(null)
      setReason('')
      load()
    } catch (e) {
      await sweetWarning('Could not save', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const agencies = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of items ?? []) if (it.agencyId) m.set(it.agencyId, it.agency ?? 'Unknown agency')
    return [...m].sort((a, b) => a[1].localeCompare(b[1]))
  }, [items])
  const visible = useMemo(() => (items ?? []).filter((it) => !agencyFilter || it.agencyId === agencyFilter), [items, agencyFilter])
  const paged = usePaged(visible, 10)
  const titles = useMemo(() => Object.fromEntries((items ?? []).map((it) => [it.unitId, it.title || 'Untitled listing'])), [items])
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const pageIds = paged.pageItems.map((it) => it.unitId)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id))

  /** One bulk request (owner only on the server), then the per-row results. */
  const runBulk = async (action: 'approve' | 'decline' | 'withdraw', body: { unitIds?: string[]; agencyId?: string }, count: number, label: string) => {
    let note = ''
    if (action === 'decline' || action === 'withdraw') {
      const answer = window.prompt(
        action === 'decline' ? 'Why can\'t these go live yet? (the agency sees this)' : 'Reason for taking these down (optional; the agency sees it)',
        '',
      )
      if (answer === null) return
      note = answer.trim()
      if (action === 'decline' && !note) {
        await sweetWarning('A reason is needed', 'Give a reason for declining.')
        return
      }
    }
    const verb = action === 'approve' ? 'Make live' : action === 'decline' ? 'Decline' : 'Take down'
    if (!(await sweetConfirm(`${verb} ${count} listing${count === 1 ? '' : 's'}${label}?`, 'Each listing is checked on its own; any that fail are listed afterwards.', verb))) return
    setBulkBusy(true)
    try {
      const res = await api<BulkResponse>('/api/admin/listing-approvals/bulk', { method: 'POST', body: JSON.stringify({ action, note, ...body }) })
      setLastRun({ action, res, titles })
      load()
    } catch (e) {
      await sweetWarning('Could not run', e instanceof Error ? e.message : String(e))
    } finally {
      setBulkBusy(false)
    }
  }

  const approveAllForAgency = async () => {
    const name = agencies.find(([id]) => id === agencyFilter)?.[1] ?? 'this agency'
    try {
      const { count } = await api<{ count: number }>(`/api/admin/listing-approvals/count?status=pending&agencyId=${encodeURIComponent(agencyFilter)}`)
      if (!count) {
        await sweetSuccess('Nothing waiting', `${name} has no listings waiting for approval.`)
        return
      }
      await runBulk('approve', { agencyId: agencyFilter }, count, ` for ${name}`)
    } catch (e) {
      await sweetWarning('Could not count', e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <PageHeader title="Listing approvals" subtitle="Agencies and landlords can't make properties live themselves. Review each one, then approve or decline with a reason." />
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Show">
          <option value="pending">Waiting for approval</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="withdrawn">Taken down</option>
          <option value="all">All</option>
        </Select>
        {agencies.length > 1 || agencyFilter ? (
          <Select className="w-auto" value={agencyFilter} onChange={(e) => { setAgencyFilter(e.target.value); setSelected(new Set()) }} aria-label="Agency">
            <option value="">All agencies</option>
            {agencies.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </Select>
        ) : null}
        {isOwner && status === 'pending' && agencyFilter ? (
          <Button size="sm" disabled={bulkBusy} onClick={() => void approveAllForAgency()}>
            <BadgeCheck className="h-4 w-4" aria-hidden /> Approve all pending for {agencies.find(([id]) => id === agencyFilter)?.[1] ?? 'this agency'}
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </Button>
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {isOwner && visible.length ? (
        <label className="flex items-center gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={allOnPage}
            onChange={() =>
              setSelected((prev) => {
                const next = new Set(prev)
                for (const id of pageIds) {
                  if (allOnPage) next.delete(id)
                  else next.add(id)
                }
                return next
              })
            }
          />
          Select all on this page
        </label>
      ) : null}
      {isOwner && selected.size ? (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary-100 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <span className="text-sm font-semibold text-ink">{selected.size} selected</span>
          {status === 'pending' || status === 'declined' ? (
            <Button size="sm" disabled={bulkBusy} onClick={() => void runBulk('approve', { unitIds: [...selected] }, selected.size, '')}>
              <BadgeCheck className="h-4 w-4" aria-hidden /> Make live
            </Button>
          ) : null}
          {status === 'pending' ? (
            <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => void runBulk('decline', { unitIds: [...selected] }, selected.size, '')}>
              <XCircle className="h-4 w-4" aria-hidden /> Decline…
            </Button>
          ) : null}
          {status === 'approved' ? (
            <Button size="sm" variant="secondary" disabled={bulkBusy} onClick={() => void runBulk('withdraw', { unitIds: [...selected] }, selected.size, '')}>
              <EyeOff className="h-4 w-4" aria-hidden /> Take down…
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      ) : null}
      {lastRun ? (
        <Card className="space-y-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">
              Last run: {lastRun.res.summary.ok} done, {lastRun.res.summary.skipped} skipped, {lastRun.res.summary.failed} failed
              {lastRun.res.remainingPending !== undefined ? ` · ${lastRun.res.remainingPending} still waiting` : ''}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setLastRun(null)}>Close</Button>
          </div>
          <ul className="space-y-1 text-sm">
            {lastRun.res.results.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium text-ink">{lastRun.titles[r.id] ?? r.id}</span>
                {r.ok && r.skipped ? (
                  <span className="text-ink-500">skipped ({r.skipped === 'already_live' ? 'already live' : r.skipped.replace('already_', 'already ')})</span>
                ) : r.ok ? (
                  <span className="text-emerald-700">{r.status === 'approved' ? 'approved' : r.status === 'withdrawn' ? 'taken down' : r.status}</span>
                ) : (
                  <span className="text-rose-700">failed: {r.error}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {items && !visible.length ? <Card className="p-6 text-sm text-ink-500">Nothing here.</Card> : null}
      <ul className="space-y-3">
        {paged.pageItems.map((it) => {
          const img = firstImage(it.images)
          return (
            <li key={it.unitId}>
              <Card className="flex flex-col gap-3 p-4 sm:flex-row">
                {isOwner ? (
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={selected.has(it.unitId)} onChange={() => toggle(it.unitId)} aria-label={`Select ${it.title || 'listing'}`} />
                ) : null}
                {img ? <img src={img} alt="" className="h-24 w-36 shrink-0 rounded-lg object-cover" /> : <div className="h-24 w-36 shrink-0 rounded-lg bg-primary-50" />}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{it.title || 'Untitled listing'}</p>
                    <Badge tone={it.status === 'approved' ? 'success' : it.status === 'declined' ? 'danger' : it.status === 'withdrawn' ? 'neutral' : 'warning'}>
                      {it.status === 'withdrawn' ? 'taken down' : it.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-600">{it.address || 'No address'}</p>
                  <p className="text-xs text-ink-500">
                    {it.agency ?? 'Unknown agency'}
                    {it.requestedBy ? ` · by ${it.requestedBy}` : ''} · asked {relativeAge(it.requestedAt)}
                    {it.rent ? ` · R ${Number(it.rent).toLocaleString('en-ZA')} /month` : it.price ? ` · R ${Number(it.price).toLocaleString('en-ZA')}` : ''}
                  </p>
                  {it.note ? <p className="text-xs text-ink-600">Note: {it.note}</p> : null}
                  {isOwner && it.status !== 'approved' && it.status !== 'withdrawn' ? (
                    declining === it.unitId ? (
                      <div className="space-y-2 pt-2">
                        <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why it can't go live yet (the agency sees this)" />
                        <div className="flex gap-2">
                          <Button size="sm" variant="danger" disabled={!reason.trim() || busy === it.unitId} onClick={() => void decide(it.unitId, 'decline', reason)}>
                            Decline listing
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeclining(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button size="sm" disabled={busy === it.unitId} onClick={() => void decide(it.unitId, 'approve')}>
                          <BadgeCheck className="h-4 w-4" aria-hidden /> Approve and make live
                        </Button>
                        {it.status === 'pending' ? (
                          <Button size="sm" variant="secondary" onClick={() => { setDeclining(it.unitId); setReason('') }}>
                            <XCircle className="h-4 w-4" aria-hidden /> Decline
                          </Button>
                        ) : null}
                      </div>
                    )
                  ) : null}
                  {isOwner && it.status === 'approved' ? (
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy === it.unitId}
                        onClick={() => {
                          const note = window.prompt('Reason for taking this down (optional; the agency sees it)', '')
                          if (note !== null) void decide(it.unitId, 'withdraw', note)
                        }}
                      >
                        <EyeOff className="h-4 w-4" aria-hidden /> Take down
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
      <Pager {...paged} />
    </div>
  )
}
