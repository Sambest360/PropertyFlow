/**
 * Super admin: listings waiting to go live. Agencies and landlords cannot
 * publish on their own; their listings wait here (server/listingApprovals.ts).
 * Approve makes the listing live; Decline needs a reason, which the agency sees.
 */
import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, RefreshCw, XCircle } from 'lucide-react'
import { actorHeaders } from '../../lib/api/actorAuth'
import { resolveApiAuthorizationHeader } from '../../lib/api/authClient'
import { Badge, Button, Card, PageHeader, Select, Textarea } from '../../components/ui'
import { sweetSuccess, sweetWarning } from '../../lib/sweetAlert'
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
  requestedBy: string | null
}

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
  const [status, setStatus] = useState<'pending' | 'approved' | 'declined' | 'all'>('pending')
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')
  const [declining, setDeclining] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    setError('')
    api<{ items: Item[] }>(`/api/admin/listing-approvals?status=${status}`)
      .then((r) => setItems(r.items))
      .catch((e: Error) => setError(e.message))
  }, [status])
  useEffect(() => load(), [load])

  const decide = async (unitId: string, decision: 'approve' | 'decline', note = '') => {
    setBusy(unitId)
    try {
      await api(`/api/admin/listing-approvals/${unitId}`, { method: 'POST', body: JSON.stringify({ decision, note }) })
      await sweetSuccess(decision === 'approve' ? 'Approved — the listing is live' : 'Declined', decision === 'approve' ? '' : 'The agency has been told why.')
      setDeclining(null)
      setReason('')
      load()
    } catch (e) {
      await sweetWarning('Could not save', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const paged = usePaged(items ?? [], 10)

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <PageHeader title="Listing approvals" subtitle="Agencies and landlords can't make properties live themselves. Review each one, then approve or decline with a reason." />
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Show">
          <option value="pending">Waiting for approval</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="all">All</option>
        </Select>
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
        </Button>
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {items && !items.length ? <Card className="p-6 text-sm text-ink-500">Nothing here.</Card> : null}
      <ul className="space-y-3">
        {paged.pageItems.map((it) => {
          const img = firstImage(it.images)
          return (
            <li key={it.unitId}>
              <Card className="flex flex-col gap-3 p-4 sm:flex-row">
                {img ? <img src={img} alt="" className="h-24 w-36 shrink-0 rounded-lg object-cover" /> : <div className="h-24 w-36 shrink-0 rounded-lg bg-primary-50" />}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{it.title || 'Untitled listing'}</p>
                    <Badge tone={it.status === 'approved' ? 'success' : it.status === 'declined' ? 'danger' : 'warning'}>{it.status}</Badge>
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
