import { useEffect, useState } from 'react'
import { authHeaders } from '../../lib/api/authClient'
import { readDocumentFile } from '../../lib/applicationDocDownscale'
import { INSPECTION_DEADLINE_NOTE } from '../../lib/inspections/deadlines'
import { Badge, Button, Card } from '../ui'

type InspectionSummary = {
  id: string
  type: string
  status: string
  dispute_note?: string | null
  pdf_document_id?: string | null
}

type InspectionItem = {
  id: string
  item_name: string
  quantity: number
  condition: string | null
  outcome: string | null
  notes: string | null
  tenant_comment: string | null
}

type CompareRow = {
  itemId: string
  itemName: string
  moveInCondition: string | null
  moveOutCondition: string | null
  outcome: string | null
  tone: string
}

type CompareBody = {
  deemedGoodOrder: boolean
  warning: string | null
  rows: CompareRow[]
  totalCents: number
  remainderCents: number
  capCents: number
  capped: boolean
  deadlineNote: string
  suggestions: Array<{ id?: string; description: string; amountCents: number; status?: string }>
}

const OUTCOMES = ['OK', 'DAMAGED', 'MISSING', 'WEAR_AND_TEAR'] as const

function money(cents: number) {
  return `R ${(cents / 100).toFixed(2)}`
}

function toneClass(tone: string) {
  if (tone === 'red') return 'bg-red-50 text-red-800'
  if (tone === 'amber') return 'bg-amber-50 text-amber-900'
  if (tone === 'grey') return 'bg-stone-100 text-stone-600'
  return 'bg-white text-ink'
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`)
  return body
}

export function LeaseInspectionsPanel({
  leaseId,
  mode,
}: {
  leaseId: string
  /** Staff manage the checklist. Tenant reviews and signs. Landlord approves deductions. */
  mode: 'staff' | 'tenant' | 'landlord'
}) {
  const [rows, setRows] = useState<InspectionSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [items, setItems] = useState<InspectionItem[]>([])
  const [status, setStatus] = useState<string>('')
  const [compare, setCompare] = useState<CompareBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [witness, setWitness] = useState('')

  async function reloadList() {
    const body = await api<{ inspections: InspectionSummary[] }>(`/api/leases/${encodeURIComponent(leaseId)}/inspections`)
    setRows(body.inspections ?? [])
    return body.inspections ?? []
  }

  async function openInspection(id: string) {
    setActiveId(id)
    setCompare(null)
    const body = await api<{ inspection: { status: string }; items: InspectionItem[] }>(`/api/inspections/${id}`)
    setStatus(body.inspection.status)
    setItems(body.items ?? [])
  }

  useEffect(() => {
    let cancelled = false
    reloadList()
      .then((list) => {
        if (!cancelled && list[0]) return openInspection(list[0].id)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load inspections')
      })
    return () => {
      cancelled = true
    }
    // leaseId is the only input; reload helpers close over it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaseId])

  async function start(type: 'MOVE_IN' | 'MOVE_OUT') {
    setBusy(true)
    setError(null)
    try {
      const body = await api<{ inspection: { id: string } }>(`/api/leases/${encodeURIComponent(leaseId)}/inspections`, {
        method: 'POST',
        body: JSON.stringify({ type }),
      })
      await reloadList()
      await openInspection(body.inspection.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start inspection')
    } finally {
      setBusy(false)
    }
  }

  async function saveItem(item: InspectionItem, patch: Record<string, unknown>) {
    if (!activeId) return
    setError(null)
    try {
      await api(`/api/inspections/${activeId}/items/${item.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      await openInspection(activeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save item')
    }
  }

  async function addPhoto(item: InspectionItem, file: File) {
    const read = await readDocumentFile(file, 1_500_000)
    await saveItem(item, {
      photos: [{ dataUrl: read.dataUrl, uploadedAt: new Date().toISOString(), uploadedBy: mode }],
    })
  }

  async function sign(role: 'TENANT' | 'AGENT', tenantDeclined = false) {
    if (!activeId) return
    setBusy(true)
    setError(null)
    try {
      await api(`/api/inspections/${activeId}/sign`, {
        method: 'POST',
        body: JSON.stringify({ role, tenantDeclined, witnessNote: tenantDeclined ? witness : undefined }),
      })
      await openInspection(activeId)
      await reloadList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign')
    } finally {
      setBusy(false)
    }
  }

  async function dispute() {
    if (!activeId) return
    const comment = window.prompt('What do you dispute?')?.trim()
    if (!comment) return
    setError(null)
    try {
      await api(`/api/inspections/${activeId}/dispute`, { method: 'POST', body: JSON.stringify({ comment }) })
      await openInspection(activeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not dispute')
    }
  }

  async function loadCompare() {
    if (!activeId) return
    setError(null)
    try {
      const body = await api<CompareBody>(`/api/inspections/${activeId}/compare`)
      setCompare(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compare')
    }
  }

  async function exportPdf() {
    if (!activeId) return
    setBusy(true)
    setError(null)
    try {
      const body = await api<{ url: string }>(`/api/inspections/${activeId}/pdf`, { method: 'POST' })
      window.open(body.url, '_blank', 'noopener')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export PDF')
    } finally {
      setBusy(false)
    }
  }

  async function decide(statusName: 'APPROVED' | 'REJECTED') {
    if (!compare) return
    const ids = compare.suggestions.map((line) => line.id).filter((id): id is string => Boolean(id))
    if (!ids.length) return
    setError(null)
    try {
      await api(`/api/leases/${encodeURIComponent(leaseId)}/deductions`, {
        method: 'POST',
        body: JSON.stringify({ ids, status: statusName }),
      })
      await loadCompare()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update deductions')
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">Inspections</h2>
          {mode === 'staff' && (
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11" disabled={busy} onClick={() => void start('MOVE_IN')}>Start move-in</Button>
              <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => void start('MOVE_OUT')}>Start move-out</Button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="min-h-11 rounded-full border border-primary-100 px-3 text-sm font-semibold"
              onClick={() => void openInspection(row.id)}
            >
              {row.type.replace('_', ' ')} · {row.status}
            </button>
          ))}
          {rows.length === 0 && <p className="text-sm text-ink-500">No inspections on this lease yet.</p>}
        </div>
        {status && <Badge tone="neutral">{status}</Badge>}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </Card>

      {activeId && (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-primary-100 bg-white p-4">
              <p className="font-semibold text-ink">{item.item_name}</p>
              <p className="text-xs text-ink-500">Qty {item.quantity} · {item.condition ?? 'Not checked'}</p>
              {mode === 'staff' && status !== 'SIGNED' && (
                <label className="mt-3 block text-xs font-medium text-ink-500">
                  Move-out outcome
                  <select
                    className="mt-1 min-h-11 w-full rounded-xl border border-primary-100 px-3 text-sm"
                    value={item.outcome ?? ''}
                    onChange={(e) => void saveItem(item, { outcome: e.target.value || null })}
                  >
                    <option value="">Not set</option>
                    {OUTCOMES.map((outcome) => (
                      <option key={outcome} value={outcome}>{outcome.replaceAll('_', ' ')}</option>
                    ))}
                  </select>
                </label>
              )}
              {mode === 'tenant' && status !== 'SIGNED' && (
                <label className="mt-3 block text-xs font-medium text-ink-500">
                  Comment
                  <textarea
                    className="mt-1 w-full rounded-xl border border-primary-100 px-3 py-2 text-sm"
                    defaultValue={item.tenant_comment ?? ''}
                    onBlur={(e) => void saveItem(item, { tenantComment: e.target.value })}
                  />
                </label>
              )}
              {status !== 'SIGNED' && (
                <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
                  Add photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void addPhoto(item, file)
                    }}
                  />
                </label>
              )}
            </li>
          ))}
        </ul>
      )}

      {activeId && (
        <Card className="space-y-3 p-4">
          {mode === 'tenant' && status !== 'SIGNED' && (
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11" disabled={busy} onClick={() => void sign('TENANT')}>Sign</Button>
              <Button variant="secondary" className="min-h-11" onClick={() => void dispute()}>Dispute</Button>
            </div>
          )}
          {mode === 'staff' && status !== 'SIGNED' && (
            <div className="space-y-2">
              <Button className="min-h-11" disabled={busy} onClick={() => void sign('AGENT')}>Sign as agent</Button>
              <label className="block text-xs font-medium text-ink-500">
                Witness note if the tenant declined
                <input className="mt-1 min-h-11 w-full rounded-xl border border-primary-100 px-3 text-sm" value={witness} onChange={(e) => setWitness(e.target.value)} />
              </label>
              <Button variant="secondary" className="min-h-11" disabled={busy || !witness.trim()} onClick={() => void sign('AGENT', true)}>
                Sign as tenant declined
              </Button>
            </div>
          )}
          {mode === 'staff' && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="min-h-11" disabled={busy} onClick={() => void exportPdf()}>Export PDF</Button>
              <Button variant="secondary" className="min-h-11" onClick={() => void loadCompare()}>Compare</Button>
            </div>
          )}
          {(mode === 'landlord' || mode === 'staff') && (
            <Button variant="secondary" className="min-h-11" onClick={() => void loadCompare()}>View comparison</Button>
          )}
        </Card>
      )}

      {compare && (
        <Card className="space-y-3 p-4">
          <h3 className="font-display text-lg font-semibold text-ink">Move-in and move-out</h3>
          {compare.warning && <p className="text-sm text-amber-900">{compare.warning}</p>}
          <div className="grid gap-2">
            {compare.rows.map((row) => (
              <div key={row.itemId} className={`grid gap-2 rounded-xl border border-primary-100 p-3 sm:grid-cols-2 ${toneClass(row.tone)}`}>
                <div>
                  <p className="text-xs uppercase tracking-wide">Move-in</p>
                  <p className="font-semibold">{row.itemName}</p>
                  <p className="text-sm">{row.moveInCondition ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide">Move-out</p>
                  <p className="font-semibold">{row.outcome?.replaceAll('_', ' ') ?? 'Not set'}</p>
                  <p className="text-sm">{row.moveOutCondition ?? '—'}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm font-semibold text-ink">
            Deductions {money(compare.totalCents)} · Deposit and interest {money(compare.capCents)} · Refund remainder {money(compare.remainderCents)}
            {compare.capped ? ' · capped' : ''}
          </p>
          <p className="text-xs text-ink-500">{compare.deadlineNote || INSPECTION_DEADLINE_NOTE}</p>
          {mode === 'landlord' && compare.suggestions.length > 0 && !compare.deemedGoodOrder && (
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11" onClick={() => void decide('APPROVED')}>Approve deductions</Button>
              <Button variant="secondary" className="min-h-11" onClick={() => void decide('REJECTED')}>Reject deductions</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
