import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { readDocumentFile } from '../../lib/applicationDocDownscale'
import { APPLICATION_DOC_MAX_BYTES } from '../../lib/applicationDocUpload'
import { inspectionApi, inspectionFileObjectUrl } from '../../lib/inspections/api'
import { OUTCOME_LABEL } from '../../lib/inspections/compare'
import { INSPECTION_DEADLINE_NOTE } from '../../lib/inspections/deadlines'
import { Badge, Button, Card, cn } from '../ui'
import { InspectionPhotoThumb } from './InspectionPhotoThumb'

type InspectionSummary = {
  id: string
  type: string
  status: string
  scheduled_at?: string | null
  dispute_note?: string | null
  pdf_document_id?: string | null
}

type Photo = { documentId: string; url: string; uploadedAt: string; uploaderRole?: string }

type InspectionItem = {
  id: string
  item_name: string
  quantity: number
  condition: string | null
  outcome: string | null
  notes: string | null
  tenant_comment: string | null
  addendum: boolean
  added_at?: string | null
  photos: Photo[]
}

type InspectionDetail = {
  id: string
  type: string
  status: string
  scheduled_at: string | null
  conducted_at: string | null
  tenant_attended: boolean
  dispute_note: string | null
  pdf_url: string | null
}

const OUTCOMES = ['OK', 'DAMAGED', 'MISSING', 'WEAR_AND_TEAR'] as const
const CONDITIONS = ['EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'NEEDS_REPLACEMENT'] as const

const OUTCOME_BUTTON: Record<(typeof OUTCOMES)[number], string> = {
  OK: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  DAMAGED: 'border-amber-300 bg-amber-50 text-amber-900',
  MISSING: 'border-red-300 bg-red-50 text-red-800',
  WEAR_AND_TEAR: 'border-stone-300 bg-stone-100 text-stone-700',
}

/** Photos are compressed in the browser first, like application documents. */
const PHOTO_TARGET_BYTES = 1_500_000

function statusTone(status: string) {
  if (status === 'SIGNED') return 'success' as const
  if (status === 'DISPUTED') return 'danger' as const
  if (status === 'AWAITING_SIGNATURES') return 'warning' as const
  return 'neutral' as const
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function label(text: string) {
  return text.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

/**
 * Move-in / move-out checklist for one lease. Mobile first: one card per item,
 * large tap targets, camera capture for photos, sign bar at the end.
 */
export function LeaseInspectionsPanel({
  leaseId,
  mode,
}: {
  leaseId: string
  /** Staff manage the checklist. Tenant reviews and signs. Landlord views and approves deductions. */
  mode: 'staff' | 'tenant' | 'landlord'
}) {
  const [rows, setRows] = useState<InspectionSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [detail, setDetail] = useState<InspectionDetail | null>(null)
  const [items, setItems] = useState<InspectionItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [witness, setWitness] = useState('')
  const [newItem, setNewItem] = useState({ name: '', quantity: 1 })

  const readOnly = detail?.status === 'SIGNED'
  const status = detail?.status ?? ''

  async function reloadList() {
    const body = await inspectionApi<{ inspections: InspectionSummary[] }>(`/api/leases/${encodeURIComponent(leaseId)}/inspections`)
    setRows(body.inspections ?? [])
    return body.inspections ?? []
  }

  async function openInspection(id: string) {
    setActiveId(id)
    const body = await inspectionApi<{ inspection: InspectionDetail; items: InspectionItem[] }>(`/api/inspections/${id}`)
    setDetail(body.inspection)
    setItems(body.items ?? [])
  }

  useEffect(() => {
    let cancelled = false
    reloadList()
      .then((list) => {
        if (!cancelled && list.length) return openInspection(list[list.length - 1].id)
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

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback)
    } finally {
      setBusy(false)
    }
  }

  const start = (type: 'MOVE_IN' | 'MOVE_OUT') =>
    run(async () => {
      const body = await inspectionApi<{ inspection: { id: string } }>(`/api/leases/${encodeURIComponent(leaseId)}/inspections`, {
        method: 'POST',
        body: JSON.stringify({ type }),
      })
      await reloadList()
      await openInspection(body.inspection.id)
    }, 'Could not start inspection')

  const patchInspection = (patch: Record<string, unknown>) =>
    run(async () => {
      if (!activeId) return
      await inspectionApi(`/api/inspections/${activeId}`, { method: 'PATCH', body: JSON.stringify(patch) })
      await openInspection(activeId)
      await reloadList()
    }, 'Could not update the inspection')

  async function saveItem(item: InspectionItem, patch: Record<string, unknown>) {
    if (!activeId) return
    setError(null)
    try {
      const res = await inspectionApi<{ warning?: string | null }>(`/api/inspections/${activeId}/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      setNotice(res.warning ?? null)
      await openInspection(activeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save item')
    }
  }

  const addPhoto = (item: InspectionItem, file: File) =>
    run(async () => {
      if (!activeId) return
      const read = await readDocumentFile(file, PHOTO_TARGET_BYTES)
      if (read.mimeType !== 'image/jpeg' && read.mimeType !== 'image/png') throw new Error('Upload a JPEG or PNG photo.')
      if (read.bytes > APPLICATION_DOC_MAX_BYTES) throw new Error('This photo is larger than 2 MB after compression.')
      await inspectionApi(`/api/inspections/${activeId}/items/${item.id}/photos`, {
        method: 'POST',
        body: JSON.stringify({ name: read.name, dataUrl: read.dataUrl }),
      })
      await openInspection(activeId)
    }, 'Could not upload the photo')

  const addItem = () =>
    run(async () => {
      if (!activeId || !newItem.name.trim()) return
      const res = await inspectionApi<{ addendum: boolean }>(`/api/inspections/${activeId}/items`, {
        method: 'POST',
        body: JSON.stringify({ itemName: newItem.name.trim(), quantity: newItem.quantity }),
      })
      setNewItem({ name: '', quantity: 1 })
      await openInspection(activeId)
      if (res.addendum) setNotice('Added to a dated addendum. The signed rows are unchanged.')
    }, 'Could not add the item')

  const sign = (role: 'TENANT' | 'AGENT', tenantDeclined = false) =>
    run(async () => {
      if (!activeId) return
      await inspectionApi(`/api/inspections/${activeId}/sign`, {
        method: 'POST',
        body: JSON.stringify({ role, tenantDeclined, witnessNote: tenantDeclined ? witness : undefined }),
      })
      setWitness('')
      await openInspection(activeId)
      await reloadList()
    }, 'Could not sign')

  const refuse = () =>
    run(async () => {
      if (!activeId) return
      const comment = window.prompt('Why are you not signing? The agent will see this.')?.trim()
      if (!comment) return
      await inspectionApi(`/api/inspections/${activeId}/sign`, {
        method: 'POST',
        body: JSON.stringify({ role: 'TENANT', refused: true, comment }),
      })
      await openInspection(activeId)
      await reloadList()
    }, 'Could not record the refusal')

  const exportPdf = () =>
    run(async () => {
      if (!activeId) return
      const body = await inspectionApi<{ url: string }>(`/api/inspections/${activeId}/pdf`, { method: 'POST' })
      window.open(await inspectionFileObjectUrl(body.url), '_blank', 'noopener')
      await openInspection(activeId)
    }, 'Could not export PDF')

  const canEditItems = mode === 'staff' && !readOnly
  const isMoveOut = detail?.type === 'MOVE_OUT'

  return (
    <div className="space-y-4 pb-24 sm:pb-0">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">Inspections</h2>
          {mode === 'staff' && (
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Button disabled={busy} onClick={() => void start('MOVE_IN')}>Start move-in</Button>
              <Button variant="secondary" disabled={busy} onClick={() => void start('MOVE_OUT')}>Start move-out</Button>
            </div>
          )}
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              aria-pressed={row.id === activeId}
              className={cn(
                'min-h-11 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-semibold',
                row.id === activeId ? 'border-primary bg-primary text-white' : 'border-primary-100 bg-white text-ink',
              )}
              onClick={() => void openInspection(row.id).catch(() => setError('Could not open the inspection'))}
            >
              {label(row.type)} · {label(row.status)}
            </button>
          ))}
          {rows.length === 0 && <p className="text-sm text-ink-500">No inspections on this lease yet.</p>}
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
      </Card>

      {detail && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(status)}>{label(status)}</Badge>
            <span className="text-sm font-semibold text-ink">{label(detail.type)} inspection</span>
          </div>
          {readOnly && (
            <p className="text-sm text-ink-600">Signed. Items are read-only; anything added now goes into a dated addendum.</p>
          )}
          {detail.dispute_note && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">Tenant dispute: {detail.dispute_note}</p>
          )}
          {mode === 'staff' && !readOnly ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-ink-500">
                Scheduled for
                <input
                  type="datetime-local"
                  className="mt-1 min-h-11 w-full rounded-xl border border-primary-100 px-3 text-sm"
                  defaultValue={toLocalInput(detail.scheduled_at)}
                  key={`${detail.id}-${detail.scheduled_at ?? ''}`}
                  onBlur={(e) => {
                    const next = e.target.value ? new Date(e.target.value).toISOString() : null
                    if (next !== (detail.scheduled_at ? new Date(detail.scheduled_at).toISOString() : null)) {
                      void patchInspection({ scheduled_at: next })
                    }
                  }}
                />
              </label>
              <label className="flex min-h-11 items-center gap-3 self-end text-sm text-ink">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={detail.tenant_attended}
                  onChange={(e) => void patchInspection({ tenant_attended: e.target.checked })}
                />
                Tenant attended
              </label>
            </div>
          ) : (
            <p className="text-sm text-ink-600">
              {detail.scheduled_at ? `Scheduled ${new Date(detail.scheduled_at).toLocaleString('en-ZA')}` : 'Not scheduled'}
              {detail.tenant_attended ? '' : ' · tenant not present'}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {isMoveOut && (
              <Link
                to={`/workspace/inspections/${detail.id}/compare`}
                className="inline-flex min-h-11 items-center rounded-full border border-primary/30 px-5 text-sm font-semibold text-primary"
              >
                Compare with move-in
              </Link>
            )}
            {mode === 'staff' && (
              <Button variant="secondary" disabled={busy} onClick={() => void exportPdf()}>Export PDF</Button>
            )}
          </div>
        </Card>
      )}

      {detail && (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-primary-100 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{item.item_name}</p>
                  <p className="text-xs text-ink-500">
                    Qty {item.quantity} · {item.condition ? label(item.condition) : 'Not checked'}
                    {item.outcome ? ` · ${OUTCOME_LABEL[item.outcome] ?? item.outcome}` : ''}
                  </p>
                </div>
                {item.addendum && (
                  <Badge tone="info">Addendum {item.added_at ? new Date(item.added_at).toLocaleDateString('en-ZA') : ''}</Badge>
                )}
              </div>

              {canEditItems && !isMoveOut && (
                <label className="mt-3 block text-xs font-medium text-ink-500">
                  Condition
                  <select
                    className="mt-1 min-h-11 w-full rounded-xl border border-primary-100 px-3 text-sm"
                    value={item.condition ?? ''}
                    onChange={(e) => void saveItem(item, { condition: e.target.value || null })}
                  >
                    <option value="">Not checked</option>
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>{label(c)}</option>
                    ))}
                  </select>
                </label>
              )}

              {canEditItems && isMoveOut && (
                <fieldset className="mt-3">
                  <legend className="text-xs font-medium text-ink-500">Move-out outcome</legend>
                  <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {OUTCOMES.map((outcome) => (
                      <button
                        key={outcome}
                        type="button"
                        aria-pressed={item.outcome === outcome}
                        className={cn(
                          'min-h-11 cursor-pointer rounded-xl border px-2 text-sm font-semibold',
                          item.outcome === outcome ? OUTCOME_BUTTON[outcome] : 'border-primary-100 bg-white text-ink-600',
                        )}
                        onClick={() => void saveItem(item, { outcome })}
                      >
                        {OUTCOME_LABEL[outcome]}
                      </button>
                    ))}
                  </div>
                  {item.outcome === 'WEAR_AND_TEAR' && (
                    <p className="mt-1 text-xs text-ink-500">Fair wear and tear is never charged to the deposit.</p>
                  )}
                </fieldset>
              )}

              {canEditItems && (
                <label className="mt-3 block text-xs font-medium text-ink-500">
                  Notes
                  <textarea
                    className="mt-1 w-full rounded-xl border border-primary-100 px-3 py-2 text-sm"
                    defaultValue={item.notes ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (item.notes ?? '')) void saveItem(item, { notes: e.target.value })
                    }}
                  />
                </label>
              )}

              {mode === 'tenant' && !readOnly ? (
                <label className="mt-3 block text-xs font-medium text-ink-500">
                  Your comment
                  <textarea
                    className="mt-1 w-full rounded-xl border border-primary-100 px-3 py-2 text-sm"
                    defaultValue={item.tenant_comment ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (item.tenant_comment ?? '')) void saveItem(item, { tenantComment: e.target.value })
                    }}
                  />
                </label>
              ) : (
                item.tenant_comment && <p className="mt-2 text-sm text-ink-600">Tenant: {item.tenant_comment}</p>
              )}

              {(item.photos.length > 0 || (!readOnly && mode !== 'landlord')) && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {item.photos.map((photo) => (
                    <InspectionPhotoThumb key={photo.documentId} url={photo.url} uploadedAt={photo.uploadedAt} label={item.item_name} />
                  ))}
                  {!readOnly && mode !== 'landlord' && (
                    <label className="flex h-24 w-24 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-dashed border-primary/40 text-center text-xs font-semibold text-primary">
                      Add photo
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        capture="environment"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (file) void addPhoto(item, file)
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </li>
          ))}
          {items.length === 0 && (
            <li className="rounded-2xl border border-dashed border-primary-100 p-4 text-sm text-ink-500">
              No items. Add the unit inventory on the property's Inventory tab, or add items here.
            </li>
          )}
        </ul>
      )}

      {detail && mode === 'staff' && (
        <Card className="space-y-2 p-4">
          <p className="text-sm font-semibold text-ink">{readOnly ? 'Add to the addendum' : 'Add an item'}</p>
          <div className="grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[1fr_6rem_auto]">
            <input
              className="min-h-11 rounded-xl border border-primary-100 px-3 text-sm"
              placeholder="Item name"
              value={newItem.name}
              onChange={(e) => setNewItem((v) => ({ ...v, name: e.target.value }))}
            />
            <input
              type="number"
              min={1}
              aria-label="Quantity"
              className="min-h-11 rounded-xl border border-primary-100 px-3 text-sm"
              value={newItem.quantity}
              onChange={(e) => setNewItem((v) => ({ ...v, quantity: Math.max(1, Number(e.target.value) || 1) }))}
            />
            <Button className="col-span-2 sm:col-span-1" disabled={busy || !newItem.name.trim()} onClick={() => void addItem()}>
              Add
            </Button>
          </div>
        </Card>
      )}

      {detail && !readOnly && (mode === 'tenant' || mode === 'staff') && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-primary-100 bg-white/95 p-3 backdrop-blur sm:static sm:rounded-2xl sm:border">
          {mode === 'tenant' && (
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={busy} onClick={() => void sign('TENANT')}>Sign</Button>
              <Button variant="secondary" disabled={busy} onClick={() => void refuse()}>Refuse to sign</Button>
            </div>
          )}
          {mode === 'staff' && (
            <div className="space-y-2">
              <Button className="w-full sm:w-auto" disabled={busy} onClick={() => void sign('AGENT')}>Sign as agent</Button>
              {(status === 'DISPUTED' || status === 'AWAITING_SIGNATURES') && (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    aria-label="Witness note if the tenant declined to sign"
                    placeholder="Witness note if the tenant declined to sign"
                    className="min-h-11 w-full rounded-xl border border-primary-100 px-3 text-sm"
                    value={witness}
                    onChange={(e) => setWitness(e.target.value)}
                  />
                  <Button variant="secondary" disabled={busy || !witness.trim()} onClick={() => void sign('AGENT', true)}>
                    Sign: tenant declined
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-ink-500">{INSPECTION_DEADLINE_NOTE}</p>
    </div>
  )
}
