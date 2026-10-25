import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ImagePlus, Plus, Search } from 'lucide-react'
import type { AssetCondition, InfraRoom, InternalAsset } from '../../data/infrastructure'
import { ImageDropzone } from '../ImageDropzone'
import { Badge, Button, Card, Input, Modal, Select, Textarea, cn, statusTone } from '../ui'
import { formatZAR } from '../../data/seed'
import { useSuiteAlert } from '../alerts/SuiteAlert'
import { ListPagination, paginate } from './ListPagination'
import { ICON_STROKE } from './types'
import { useLookupOptions } from '../../hooks/useLookupOptions'

const CONDITIONS: AssetCondition[] = [
  'Excellent',
  'Good',
  'Fair',
  'Damaged',
  'Needs replacement',
]

type AssetDraft = {
  itemName: string
  assetTypeKey: string
  brand: string
  model: string
  serialNumber: string
  roomId: string
  condition: AssetCondition
  purchaseValue: string
  purchaseDate: string
  warrantyExpiresAt: string
  notes: string
  images: string[]
}

function emptyDraft(roomId = ''): AssetDraft {
  return {
    itemName: '',
    assetTypeKey: 'APPLIANCE',
    brand: '',
    model: '',
    serialNumber: '',
    roomId,
    condition: 'Good',
    purchaseValue: '',
    purchaseDate: '',
    warrantyExpiresAt: '',
    notes: '',
    images: [],
  }
}

const DEFAULT_ASSET_TYPES = ['APPLIANCE', 'ELECTRONICS', 'FURNITURE', 'FIXTURE', 'OTHER'].map((t) => ({
  value: t,
  label: t,
}))

export function PropertyInventoryPanel({
  assets,
  rooms,
  unitId,
  clientId,
  canManage,
  onUpdate,
  onAdd,
  onRemove,
}: {
  assets: InternalAsset[]
  rooms: InfraRoom[]
  unitId: string | null | undefined
  clientId: string
  canManage: boolean
  onUpdate: (id: string, patch: Partial<InternalAsset>) => void
  onAdd: (input: Omit<InternalAsset, 'id'>) => void
  onRemove: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<AssetDraft>(emptyDraft())
  const [page, setPage] = useState(1)
  const alert = useSuiteAlert()
  // Asset types from Admin → Configuration; an item's existing type stays selectable.
  const configuredTypes = useLookupOptions('ASSET_TYPE', clientId || null)
  const assetTypeOptions = useMemo(() => {
    const list = configuredTypes.length ? configuredTypes : DEFAULT_ASSET_TYPES
    return draft.assetTypeKey && !list.some((o) => o.value === draft.assetTypeKey)
      ? [{ value: draft.assetTypeKey, label: draft.assetTypeKey }, ...list]
      : list
  }, [configuredTypes, draft.assetTypeKey])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return assets
    return assets.filter(
      (a) =>
        a.itemName.toLowerCase().includes(q) ||
        (a.brand ?? '').toLowerCase().includes(q) ||
        (a.serialNumber ?? '').toLowerCase().includes(q) ||
        a.assetTypeKey.toLowerCase().includes(q),
    )
  }, [assets, query])

  useEffect(() => {
    setPage(1)
  }, [query])

  const paged = useMemo(() => paginate(filtered, page), [filtered, page])

  useEffect(() => {
    if (page !== paged.page) setPage(paged.page)
  }, [page, paged.page])

  const openCreate = () => {
    setEditingId(null)
    setDraft(emptyDraft(rooms[0]?.id ?? ''))
    setModalOpen(true)
  }

  const openEdit = (a: InternalAsset) => {
    setEditingId(a.id)
    setDraft({
      itemName: a.itemName,
      assetTypeKey: a.assetTypeKey,
      brand: a.brand ?? '',
      model: a.model ?? '',
      serialNumber: a.serialNumber ?? '',
      roomId: a.roomId ?? '',
      condition: a.condition,
      purchaseValue: a.purchaseValue != null ? String(a.purchaseValue) : '',
      purchaseDate: a.purchaseDate ?? '',
      warrantyExpiresAt: a.warrantyExpiresAt ?? '',
      notes: a.notes ?? '',
      images: a.images ?? [],
    })
    setModalOpen(true)
  }

  const save = () => {
    if (!unitId || !draft.itemName.trim()) return
    const payload: Omit<InternalAsset, 'id'> = {
      clientId,
      unitId,
      roomId: draft.roomId || null,
      itemName: draft.itemName.trim(),
      assetTypeKey: draft.assetTypeKey,
      brand: draft.brand.trim() || undefined,
      model: draft.model.trim() || undefined,
      serialNumber: draft.serialNumber.trim() || undefined,
      condition: draft.condition,
      purchaseValue: draft.purchaseValue ? Number(draft.purchaseValue) : undefined,
      purchaseDate: draft.purchaseDate || undefined,
      warrantyExpiresAt: draft.warrantyExpiresAt || undefined,
      notes: draft.notes.trim() || undefined,
      images: draft.images.length ? draft.images : undefined,
      lastInspectedAt: new Date().toISOString().slice(0, 10),
    }
    if (editingId) onUpdate(editingId, payload)
    else onAdd(payload)
    setModalOpen(false)
  }

  if (!unitId) {
    return (
      <Card className="p-8 text-center text-sm text-ink-500">
        No unit linked — inventory is managed on infrastructure units.
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold text-ink">
          Internal assets <span className="tabular text-ink-400">({assets.length})</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              strokeWidth={ICON_STROKE}
              aria-hidden
            />
            <Input
              className="min-h-11 pl-9"
              placeholder="Filter assets…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {canManage && (
            <Button className="min-h-11" onClick={openCreate}>
              <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Add asset
            </Button>
          )}
        </div>
      </div>

      <ul className="space-y-2">
        {paged.items.map((a) => {
          const open = expandedId === a.id
          const room = rooms.find((r) => r.id === a.roomId)
          return (
            <li
              key={a.id}
              className={cn(
                'overflow-hidden rounded-2xl border',
                open ? 'border-primary-200 bg-primary-50' : 'border-primary-100 bg-white',
              )}
            >
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : a.id)}
                aria-expanded={open}
                className="flex w-full min-h-11 cursor-pointer items-center gap-3 px-3 py-3 text-left"
              >
                {a.images?.[0] ? (
                  <img
                    src={a.images[0]}
                    alt=""
                    className="h-12 w-14 shrink-0 rounded-lg object-cover ring-1 ring-primary-100"
                  />
                ) : (
                  <span className="inline-flex h-12 w-14 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-ink-300 ring-1 ring-primary-100">
                    <ImagePlus className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{a.itemName}</span>
                  <span className="text-xs text-ink-500">
                    {a.brand ?? '—'}
                    {a.model ? ` ${a.model}` : ''} · {room?.name ?? 'Unassigned'}
                  </span>
                </span>
                <Badge tone={statusTone(a.condition)}>{a.condition}</Badge>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-ink-400 transition-transform duration-200',
                    open && 'rotate-180',
                  )}
                  strokeWidth={ICON_STROKE}
                  aria-hidden
                />
              </button>
              {open && (
                <div className="space-y-3 border-t border-primary-100/80 bg-white px-3 py-3">
                  {a.images && a.images.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto [scrollbar-width:thin]">
                      {a.images.map((src) => (
                        <img
                          key={src}
                          src={src}
                          alt=""
                          className="h-24 w-32 shrink-0 rounded-xl object-cover ring-1 ring-primary-100"
                        />
                      ))}
                    </div>
                  )}
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-ink-400">Serial</dt>
                      <dd className="font-medium tabular">{a.serialNumber ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-400">Type</dt>
                      <dd className="font-medium">{a.assetTypeKey}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-400">Purchase value</dt>
                      <dd className="font-medium tabular">
                        {a.purchaseValue != null ? formatZAR(a.purchaseValue) : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-400">Warranty</dt>
                      <dd className="font-medium tabular">{a.warrantyExpiresAt ?? '—'}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-ink-400">Notes</dt>
                      <dd className="font-medium text-ink-600">{a.notes ?? '—'}</dd>
                    </div>
                  </dl>
                  {canManage && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        variant="secondary"
                        className="min-h-11 flex-1"
                        onClick={() => openEdit(a)}
                      >
                        Edit asset
                      </Button>
                      <Button
                        variant="danger"
                        className="min-h-11 flex-1"
                        onClick={async () => {
                          const ok = await alert.confirmDelete({
                            title: 'Delete inventory item?',
                            text: `“${a.itemName}” will be permanently removed from this property’s inventory.`,
                            confirmLabel: 'Delete asset',
                          })
                          if (!ok) return
                          onRemove(a.id)
                          if (expandedId === a.id) setExpandedId(null)
                          await alert.deleted({
                            title: 'Asset deleted',
                            text: `“${a.itemName}” has been deleted.`,
                          })
                        }}
                      >
                        Delete asset
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
        {!filtered.length && (
          <li className="py-8 text-center text-sm text-ink-500">No inventory matches.</li>
        )}
      </ul>

      <ListPagination
        page={paged.page}
        totalPages={paged.totalPages}
        total={paged.total}
        pageSize={paged.pageSize}
        onPageChange={setPage}
        label="assets"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit asset' : 'Add asset'}
        description="Capture serials, warranty, photos, and room placement."
        size="lg"
        footer={
          <>
            <Button variant="secondary" className="min-h-11" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button className="min-h-11" onClick={save} disabled={!draft.itemName.trim()}>
              {editingId ? 'Save changes' : 'Add asset'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
            Item name
            <Input
              className="mt-1 min-h-11"
              value={draft.itemName}
              onChange={(e) => setDraft({ ...draft, itemName: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Type
            <Select
              className="mt-1 min-h-11 w-full"
              value={draft.assetTypeKey}
              onChange={(e) => setDraft({ ...draft, assetTypeKey: e.target.value })}
            >
              {assetTypeOptions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Room
            <Select
              className="mt-1 min-h-11 w-full"
              value={draft.roomId}
              onChange={(e) => setDraft({ ...draft, roomId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Brand
            <Input
              className="mt-1 min-h-11"
              value={draft.brand}
              onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Model
            <Input
              className="mt-1 min-h-11"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Serial number
            <Input
              className="mt-1 min-h-11 tabular"
              value={draft.serialNumber}
              onChange={(e) => setDraft({ ...draft, serialNumber: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Condition
            <Select
              className="mt-1 min-h-11 w-full"
              value={draft.condition}
              onChange={(e) => setDraft({ ...draft, condition: e.target.value as AssetCondition })}
            >
              {CONDITIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Purchase value (ZAR)
            <Input
              type="number"
              className="mt-1 min-h-11 tabular"
              value={draft.purchaseValue}
              onChange={(e) => setDraft({ ...draft, purchaseValue: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Purchase date
            <Input
              type="date"
              className="mt-1 min-h-11"
              value={draft.purchaseDate}
              onChange={(e) => setDraft({ ...draft, purchaseDate: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
            Warranty expires
            <Input
              type="date"
              className="mt-1 min-h-11"
              value={draft.warrantyExpiresAt}
              onChange={(e) => setDraft({ ...draft, warrantyExpiresAt: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
            Notes
            <Textarea
              className="mt-1 min-h-20"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
          <div className="sm:col-span-2">
            <ImageDropzone
              label="Photos"
              value={draft.images}
              onChange={(images) => setDraft({ ...draft, images })}
              multiple
              max={8}
              hint="Drag & drop photos here, or click to open your gallery"
            />
          </div>
        </div>
      </Modal>
    </Card>
  )
}
