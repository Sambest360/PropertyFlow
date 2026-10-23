import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { readDocumentFile } from '../../lib/applicationDocDownscale'
import { APPLICATION_DOC_MAX_BYTES } from '../../lib/applicationDocUpload'
import { inspectionApi } from '../../lib/inspections/api'
import type { InventoryPropertyType } from '../../lib/inspections/templates'
import { InspectionPhotoThumb } from '../inspections/InspectionPhotoThumb'
import { Button, Card } from '../ui'

type InventoryRow = {
  id: string
  item_name: string
  quantity: number
  condition_status: string
  notes: string | null
  photos: Array<{ documentId: string; uploadedAt: string }> | null
}

const TYPES: InventoryPropertyType[] = ['apartment', 'house', 'room']

/**
 * Inspection inventory for one unit (server internal_assets with quantity and
 * photos). Move-in inspections copy these rows; rows added after a signed
 * move-in go onto it as a dated addendum.
 */
export function UnitInventoryChecklist({ unitRef, canManage }: { unitRef: string; canManage: boolean }) {
  const [rows, setRows] = useState<InventoryRow[] | null>(null)
  const [propertyType, setPropertyType] = useState<InventoryPropertyType>('apartment')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const base = `/api/units/${encodeURIComponent(unitRef)}/inventory`

  const load = useCallback(async () => {
    try {
      const body = await inspectionApi<{ items: InventoryRow[] }>(base)
      setRows(body.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the inventory')
      setRows([])
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback)
    } finally {
      setBusy(false)
    }
  }

  const fromTemplate = () =>
    run(async () => {
      const res = await inspectionApi<{ addendumInspectionId: string | null }>(base, {
        method: 'POST',
        body: JSON.stringify({ propertyType }),
      })
      if (res.addendumInspectionId) setNotice('A move-in is already signed, so these items were added to it as a dated addendum.')
    }, 'Could not create the inventory')

  const setQuantity = (row: InventoryRow, quantity: number) =>
    run(async () => {
      await inspectionApi(base, { method: 'PATCH', body: JSON.stringify({ id: row.id, quantity }) })
    }, 'Could not save the quantity')

  const addPhoto = (row: InventoryRow, file: File) =>
    run(async () => {
      const read = await readDocumentFile(file, 1_500_000)
      if (read.bytes > APPLICATION_DOC_MAX_BYTES) throw new Error('This photo is larger than 2 MB after compression.')
      await inspectionApi(`${base}/${row.id}/photos`, {
        method: 'POST',
        body: JSON.stringify({ name: read.name, dataUrl: read.dataUrl }),
      })
    }, 'Could not upload the photo')

  return (
    <Card className="mb-4 space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Inspection checklist</h2>
          <p className="text-sm text-ink-500">Copied into each move-in inspection on this unit.</p>
        </div>
        {canManage && (
          <div className="grid w-full grid-cols-[1fr_auto] gap-2 sm:flex sm:w-auto">
            <select
              aria-label="Template"
              className="min-h-11 rounded-xl border border-primary-100 px-3 text-sm"
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value as InventoryPropertyType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)} template</option>
              ))}
            </select>
            <Button disabled={busy} onClick={() => void fromTemplate()}>Add from template</Button>
          </div>
        )}
      </div>
      {canManage && (
        <Link to="/workspace/admin/inventory-templates" className="text-sm font-semibold text-primary underline">
          Edit agency templates
        </Link>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
      {rows === null && <p className="text-sm text-ink-500">Loading…</p>}
      {rows?.length === 0 && !error && <p className="text-sm text-ink-500">No checklist items yet.</p>}
      <ul className="divide-y divide-primary-100">
        {rows?.map((row) => (
          <li key={row.id} className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{row.item_name}</p>
                <p className="text-xs text-ink-500">{[row.notes, row.condition_status?.toLowerCase()].filter(Boolean).join(' · ')}</p>
              </div>
              {canManage ? (
                <input
                  type="number"
                  min={1}
                  aria-label={`Quantity of ${row.item_name}`}
                  className="min-h-11 w-20 rounded-xl border border-primary-100 px-3 text-sm"
                  defaultValue={row.quantity}
                  onBlur={(e) => {
                    const next = Math.max(1, Number(e.target.value) || 1)
                    if (next !== row.quantity) void setQuantity(row, next)
                  }}
                />
              ) : (
                <span className="text-sm text-ink-600">Qty {row.quantity}</span>
              )}
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {(row.photos ?? []).map((p) => (
                <InspectionPhotoThumb key={p.documentId} url={`/api/inspection-files/${p.documentId}`} uploadedAt={p.uploadedAt} label={row.item_name} />
              ))}
              {canManage && (
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
                      if (file) void addPhoto(row, file)
                    }}
                  />
                </label>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
