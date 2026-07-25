import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import type { InfraRoom, InternalAsset, RoomKind } from '../../data/infrastructure'
import { roomKindLabel } from '../../data/infrastructure'
import { FloorPlanCanvas, ROOM_COLORS, roomFill } from '../infrastructure/FloorPlanCanvas'
import { Badge, Button, Card, Input, Modal, Select, cn, statusTone } from '../ui'
import { useSuiteAlert } from '../alerts/SuiteAlert'
import { ListPagination, paginate } from './ListPagination'
import { ICON_STROKE } from './types'

const ROOM_KINDS: RoomKind[] = [
  'bedroom',
  'bathroom',
  'kitchen',
  'living',
  'dining',
  'study',
  'garage',
  'other',
]

type RoomDraft = {
  name: string
  kind: RoomKind
  color: string
  beds: number
  baths: number
  areaSqm: string
  w: number
  h: number
}

const emptyDraft = (): RoomDraft => ({
  name: '',
  kind: 'bedroom',
  color: 'blue',
  beds: 1,
  baths: 0,
  areaSqm: '',
  w: 28,
  h: 28,
})

export function PropertyFloorPlanPanel({
  rooms,
  assets,
  unitId,
  clientId,
  canManage,
  onUpdateRoom,
  onAddRoom,
  onRemoveRoom,
}: {
  rooms: InfraRoom[]
  assets: InternalAsset[]
  unitId: string | null | undefined
  clientId: string
  canManage: boolean
  onUpdateRoom: (id: string, patch: Partial<InfraRoom>) => void
  onAddRoom: (input: {
    unitId: string
    clientId: string
    name: string
    kind: RoomKind
    beds?: number
    baths?: number
    areaSqm?: number
    color?: string
    layout?: InfraRoom['layout']
  }) => void
  onRemoveRoom: (id: string) => void
}) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(rooms[0]?.id ?? null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<RoomDraft>(emptyDraft())
  const [pendingDrop, setPendingDrop] = useState<{ x: number; y: number } | null>(null)
  const [page, setPage] = useState(1)
  const alert = useSuiteAlert()

  const selected = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  )
  const roomAssets = assets.filter((a) => (selectedRoomId ? a.roomId === selectedRoomId : false))
  const paged = useMemo(() => paginate(rooms, page), [rooms, page])

  useEffect(() => {
    if (page !== paged.page) setPage(paged.page)
  }, [page, paged.page])

  const openCreate = (at?: { x: number; y: number }) => {
    setEditingId(null)
    setDraft(emptyDraft())
    setPendingDrop(at ?? null)
    setModalOpen(true)
  }

  const openEdit = (room: InfraRoom) => {
    setEditingId(room.id)
    setDraft({
      name: room.name,
      kind: room.kind,
      color: room.color ?? 'blue',
      beds: room.beds,
      baths: room.baths,
      areaSqm: room.areaSqm != null ? String(room.areaSqm) : '',
      w: room.layout.w,
      h: room.layout.h,
    })
    setPendingDrop(null)
    setModalOpen(true)
  }

  const saveModal = () => {
    if (!unitId || !draft.name.trim()) return
    if (editingId) {
      onUpdateRoom(editingId, {
        name: draft.name.trim(),
        kind: draft.kind,
        color: draft.color,
        beds: draft.beds,
        baths: draft.baths,
        areaSqm: draft.areaSqm === '' ? undefined : Number(draft.areaSqm),
        layout: {
          ...(rooms.find((r) => r.id === editingId)?.layout ?? { x: 10, y: 10, w: 28, h: 28 }),
          w: draft.w,
          h: draft.h,
        },
      })
    } else {
      onAddRoom({
        unitId,
        clientId,
        name: draft.name.trim(),
        kind: draft.kind,
        beds: draft.beds,
        baths: draft.baths,
        areaSqm: draft.areaSqm === '' ? undefined : Number(draft.areaSqm),
        color: draft.color,
        layout: {
          x: pendingDrop?.x ?? 10,
          y: pendingDrop?.y ?? 10,
          w: draft.w,
          h: draft.h,
        },
      })
    }
    setModalOpen(false)
  }

  if (!unitId) {
    return (
      <Card className="p-8 text-center text-sm text-ink-500">
        No infrastructure unit linked — floor plan configuration is unavailable for this listing.
      </Card>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-3">
        <FloorPlanCanvas
          rooms={rooms}
          assets={assets}
          selectedRoomId={selectedRoomId}
          onSelectRoom={setSelectedRoomId}
          canEdit={canManage}
          onMoveRoom={(id, layout) => onUpdateRoom(id, { layout })}
          onDropNewRoom={(point, payload) => {
            setDraft({
              ...emptyDraft(),
              name: payload.name,
              kind: payload.kind as RoomKind,
              color: payload.color,
              w: payload.w,
              h: payload.h,
              beds: payload.kind === 'bedroom' ? 1 : 0,
              baths: payload.kind === 'bathroom' ? 1 : 0,
            })
            setPendingDrop(point)
            setEditingId(null)
            setModalOpen(true)
          }}
        />

        {canManage && (
          <div className="rounded-2xl border border-dashed border-primary-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
              Drag onto plan
            </p>
            <div className="flex flex-wrap gap-2">
              {ROOM_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/x-propertyflow-room',
                      JSON.stringify({
                        name: roomKindLabel(kind),
                        kind,
                        color: 'blue',
                        w: 28,
                        h: 28,
                      }),
                    )
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  className="min-h-11 cursor-grab rounded-full border border-primary-100 bg-primary-50 px-3 text-xs font-semibold text-primary active:cursor-grabbing"
                >
                  {roomKindLabel(kind)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-ink">Rooms</h2>
            <p className="mt-0.5 text-xs text-ink-500">Expand a room for details and assets.</p>
          </div>
          {canManage && (
            <Button className="min-h-11" onClick={() => openCreate()}>
              <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Add room
            </Button>
          )}
        </div>

        <ul className="space-y-2">
          {paged.items.map((r) => {
            const open = expandedId === r.id
            const inRoom = assets.filter((a) => a.roomId === r.id)
            return (
              <li
                key={r.id}
                className={cn(
                  'overflow-hidden rounded-2xl border',
                  open ? 'border-primary-200 bg-primary-50' : 'border-primary-100 bg-white',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setExpandedId(open ? null : r.id)
                    setSelectedRoomId(r.id)
                  }}
                  aria-expanded={open}
                  className="flex w-full min-h-11 cursor-pointer items-center gap-3 px-3 py-3 text-left"
                >
                  <span
                    className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-primary-100"
                    style={{ backgroundColor: roomFill(r.color) }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{r.name}</span>
                    <span className="text-xs text-ink-500">
                      {roomKindLabel(r.kind)} · {r.layout.w}×{r.layout.h}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-ink-400 transition-transform duration-200',
                      open && 'rotate-180',
                    )}
                    strokeWidth={ICON_STROKE}
                    aria-hidden
                  />
                </button>
                {open && (
                  <div className="space-y-3 border-t border-primary-100/80 bg-white px-3 py-3">
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <dt className="text-xs text-ink-400">Beds / baths</dt>
                        <dd className="tabular font-medium">
                          {r.beds} / {r.baths}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-400">Area</dt>
                        <dd className="tabular font-medium">{r.areaSqm ? `${r.areaSqm} m²` : '—'}</dd>
                      </div>
                    </dl>
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase text-ink-400">Assets</p>
                      <ul className="space-y-1">
                        {inRoom.map((a) => (
                          <li key={a.id} className="flex justify-between text-sm">
                            <span>{a.itemName}</span>
                            <Badge tone={statusTone(a.condition)}>{a.condition}</Badge>
                          </li>
                        ))}
                        {!inRoom.length && <li className="text-sm text-ink-500">Empty</li>}
                      </ul>
                    </div>
                    {canManage && (
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="secondary"
                          className="min-h-11 w-full"
                          onClick={() => openEdit(r)}
                        >
                          Edit room
                        </Button>
                        <Button
                          variant="danger"
                          className="min-h-11 w-full"
                          onClick={async () => {
                            const ok = await alert.confirmDelete({
                              title: 'Delete floor plan room?',
                              text: `“${r.name}” will be removed from the plan. Assets in this room stay but become unassigned.`,
                              confirmLabel: 'Delete room',
                            })
                            if (!ok) return
                            onRemoveRoom(r.id)
                            if (selectedRoomId === r.id) setSelectedRoomId(null)
                            if (expandedId === r.id) setExpandedId(null)
                            await alert.deleted({
                              title: 'Room deleted',
                              text: `“${r.name}” has been deleted from the floor plan.`,
                            })
                          }}
                        >
                          Delete room
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
          {!rooms.length && <li className="py-6 text-center text-sm text-ink-500">No rooms yet.</li>}
        </ul>

        <ListPagination
          page={paged.page}
          totalPages={paged.totalPages}
          total={paged.total}
          pageSize={paged.pageSize}
          onPageChange={setPage}
          label="rooms"
        />

        {selected && !expandedId && (
          <p className="mt-3 text-xs text-ink-400">
            Selected on plan: <strong className="text-ink">{selected.name}</strong> ·{' '}
            {roomAssets.length} assets
          </p>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit room' : 'Add room'}
        description="Set name, type, colour, and size for the floor plan."
        size="md"
        footer={
          <>
            <Button variant="secondary" className="min-h-11" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button className="min-h-11" onClick={saveModal} disabled={!draft.name.trim()}>
              {editingId ? 'Save changes' : 'Add to plan'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs font-medium text-ink-500">
            Name
            <Input
              className="mt-1 min-h-11"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Room type
            <Select
              className="mt-1 min-h-11 w-full"
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as RoomKind })}
            >
              {ROOM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {roomKindLabel(k)}
                </option>
              ))}
            </Select>
          </label>
          <div>
            <p className="mb-2 text-xs font-medium text-ink-500">Colour</p>
            <div className="flex flex-wrap gap-2">
              {ROOM_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setDraft({ ...draft, color: c.id })}
                  aria-label={c.label}
                  aria-pressed={draft.color === c.id}
                  className={cn(
                    'h-11 w-11 cursor-pointer rounded-xl ring-2 transition-shadow duration-200',
                    draft.color === c.id ? 'ring-primary' : 'ring-transparent hover:ring-primary-200',
                  )}
                  style={{ backgroundColor: c.fill }}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-ink-500">
              Width
              <Input
                type="number"
                className="mt-1 min-h-11 tabular"
                value={draft.w}
                onChange={(e) => setDraft({ ...draft, w: Number(e.target.value) || 10 })}
              />
            </label>
            <label className="block text-xs font-medium text-ink-500">
              Height
              <Input
                type="number"
                className="mt-1 min-h-11 tabular"
                value={draft.h}
                onChange={(e) => setDraft({ ...draft, h: Number(e.target.value) || 10 })}
              />
            </label>
            <label className="block text-xs font-medium text-ink-500">
              Beds
              <Input
                type="number"
                className="mt-1 min-h-11 tabular"
                value={draft.beds}
                onChange={(e) => setDraft({ ...draft, beds: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="block text-xs font-medium text-ink-500">
              Baths
              <Input
                type="number"
                className="mt-1 min-h-11 tabular"
                value={draft.baths}
                onChange={(e) => setDraft({ ...draft, baths: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
              Area (m²)
              <Input
                type="number"
                className="mt-1 min-h-11 tabular"
                value={draft.areaSqm}
                onChange={(e) => setDraft({ ...draft, areaSqm: e.target.value })}
              />
            </label>
          </div>
        </div>
      </Modal>
    </div>
  )
}
