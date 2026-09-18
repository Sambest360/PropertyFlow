import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, ChevronDown, Pencil, Plus, Search, Users } from 'lucide-react'
import type { AppUser, Viewing, ViewingSlot } from '../../types/domain'
import { Badge, Button, Card, Input, Modal, Select, Textarea, cn, statusTone } from '../ui'
import { PropertyAgentField } from '../viewings/PropertyAgentField'
import {
  EditViewingSlotModal,
  type EditViewingSlotPayload,
} from '../viewings/EditViewingSlotModal'
import { useSuiteAlert } from '../alerts/SuiteAlert'
import { ListPagination, paginate } from './ListPagination'
import { ICON_STROKE } from './types'

type SlotDraft = {
  title: string
  date: string
  time: string
  capacity: string
  durationMinutes: string
  notes: string
  agentId: string
}

export function PropertyViewingsPanel({
  slots,
  viewings,
  agencyId,
  propertyId,
  agentId,
  agents,
  canManage,
  onCreateSlot,
  onUpdateSlot,
  onUpdateAttendee,
  onRemoveSlot,
  onTransferSlot,
}: {
  slots: ViewingSlot[]
  viewings: Viewing[]
  agencyId: string
  propertyId: string
  agentId: string | null
  agents: AppUser[]
  canManage: boolean
  onCreateSlot: (input: Omit<ViewingSlot, 'id' | 'booked' | 'status'> & { capacity?: number }) => void
  onUpdateSlot: (id: string, patch: Partial<ViewingSlot>) => void
  onUpdateAttendee: (id: string, patch: Partial<Viewing>) => void
  onRemoveSlot: (id: string) => void
  onTransferSlot: (fromSlotId: string, toSlotId: string) => boolean
}) {
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [transferTo, setTransferTo] = useState<Record<string, string>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [editSlotId, setEditSlotId] = useState<string | null>(null)
  const alert = useSuiteAlert()
  const [draft, setDraft] = useState<SlotDraft>({
    title: '',
    date: '',
    time: '10:00',
    capacity: '4',
    durationMinutes: '45',
    notes: '',
    agentId: agentId ?? '',
  })

  const propertySlots = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = slots
      .filter((s) => s.propertyId === propertyId)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    if (!q) return list
    return list.filter(
      (s) =>
        (s.title ?? '').toLowerCase().includes(q) ||
        s.date.includes(q) ||
        s.time.includes(q) ||
        s.status.toLowerCase().includes(q),
    )
  }, [slots, propertyId, query])

  useEffect(() => {
    setPage(1)
  }, [query])

  const paged = useMemo(() => paginate(propertySlots, page), [propertySlots, page])

  useEffect(() => {
    if (page !== paged.page) setPage(paged.page)
  }, [page, paged.page])

  const attendeesFor = (slotId: string) =>
    viewings.filter((v) => v.slotId === slotId && v.status !== 'Cancelled')

  const transferTargets = (from: ViewingSlot) => {
    const movers = attendeesFor(from.id).length
    return propertySlots.filter(
      (s) =>
        s.id !== from.id &&
        s.status !== 'Cancelled' &&
        s.capacity - s.booked >= movers &&
        movers > 0,
    )
  }

  const editSlot = editSlotId ? propertySlots.find((s) => s.id === editSlotId) ?? null : null

  const saveSlotEdit = (payload: EditViewingSlotPayload) => {
    if (!editSlot) return
    onUpdateSlot(editSlot.id, payload)
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
            <h2 className="font-semibold text-ink">Open viewings</h2>
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            Agents publish slots; applicants book into them. Expand a slot to see who is coming.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/workspace/sales/viewings/property/${encodeURIComponent(propertyId)}`}
            className="inline-flex"
          >
            <Button variant="secondary" className="min-h-11 gap-1.5 rounded-2xl">
              Full viewing desk
              <ArrowUpRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            </Button>
          </Link>
          <div className="relative min-w-[12rem] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              strokeWidth={ICON_STROKE}
              aria-hidden
            />
            <Input
              className="min-h-11 pl-9"
              placeholder="Filter slots…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {canManage && (
            <Button
              className="min-h-11"
              onClick={() => {
                setDraft({
                  title: '',
                  date: '',
                  time: '10:00',
                  capacity: '4',
                  durationMinutes: '45',
                  notes: '',
                  agentId: agentId ?? '',
                })
                setModalOpen(true)
              }}
            >
              <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Create viewing
            </Button>
          )}
        </div>
      </div>

      <ul className="space-y-2">
        {paged.items.map((slot) => {
          const open = expandedId === slot.id
          const attendees = attendeesFor(slot.id)
          const agent = agents.find((a) => a.id === slot.agentId)
          const targets = transferTargets(slot)
          return (
            <li
              key={slot.id}
              className={cn(
                'overflow-hidden rounded-2xl border',
                open ? 'border-primary-200 bg-primary-50' : 'border-primary-100 bg-white',
              )}
            >
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : slot.id)}
                aria-expanded={open}
                className="flex w-full min-h-11 cursor-pointer items-center gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">
                    {slot.title?.trim() || `Viewing · ${slot.time}`}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs tabular text-ink-500">
                    <span>{slot.date}</span>
                    <span>·</span>
                    <span>{slot.time}</span>
                    {slot.durationMinutes ? <span>· {slot.durationMinutes} min</span> : null}
                    <span>· {agent?.name ?? 'Unassigned agent'}</span>
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-500">
                  <Users className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                  <span className="tabular">
                    {slot.booked}/{slot.capacity}
                  </span>
                </span>
                <Badge tone={statusTone(slot.status)}>{slot.status}</Badge>
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
                <div className="space-y-3 border-t border-primary-100/80 bg-white px-4 py-4">
                  {slot.notes && <p className="text-sm text-ink-600">{slot.notes}</p>}
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                    Attendees ({attendees.length})
                  </p>
                  <ul className="space-y-2">
                    {attendees.map((v) => (
                      <li
                        key={v.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-50 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-ink">{v.applicantName}</p>
                          <p className="text-xs text-ink-500">{v.applicantEmail ?? 'No email'}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {canManage ? (
                            <Select
                              className="min-h-11"
                              value={v.status}
                              onChange={(e) =>
                                onUpdateAttendee(v.id, {
                                  status: e.target.value as Viewing['status'],
                                })
                              }
                            >
                              {['Scheduled', 'Completed', 'No-show', 'Cancelled'].map((s) => (
                                <option key={s}>{s}</option>
                              ))}
                            </Select>
                          ) : (
                            <Badge tone={statusTone(v.status)}>{v.status}</Badge>
                          )}
                        </div>
                      </li>
                    ))}
                    {!attendees.length && (
                      <li className="text-sm text-ink-500">No one has booked this slot yet.</li>
                    )}
                  </ul>
                  {canManage && (
                    <div className="space-y-3 border-t border-primary-50 pt-3">
                      <div className="flex flex-wrap gap-2">
                        {slot.status !== 'Cancelled' && (
                          <Button
                            variant="secondary"
                            className="min-h-11 gap-1.5"
                            onClick={() => setEditSlotId(slot.id)}
                          >
                            <Pencil className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                            Edit slot
                          </Button>
                        )}
                        {slot.status === 'Open' && (
                          <Button
                            variant="secondary"
                            className="min-h-11"
                            onClick={() => onUpdateSlot(slot.id, { status: 'Cancelled' })}
                          >
                            Cancel slot
                          </Button>
                        )}
                        {slot.status === 'Cancelled' && (
                          <Button
                            variant="secondary"
                            className="min-h-11"
                            onClick={() => onUpdateSlot(slot.id, { status: 'Open' })}
                          >
                            Reopen slot
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          className="min-h-11"
                          onClick={async () => {
                            const label = slot.title?.trim() || `${slot.date} ${slot.time}`
                            const ok = await alert.confirmDelete({
                              title: 'Delete viewing slot?',
                              text: `“${label}” will be deleted. Attendees on this slot will be marked cancelled.`,
                              confirmLabel: 'Delete slot',
                            })
                            if (!ok) return
                            onRemoveSlot(slot.id)
                            if (expandedId === slot.id) setExpandedId(null)
                            await alert.deleted({
                              title: 'Slot deleted',
                              text: `“${label}” has been deleted.`,
                            })
                          }}
                        >
                          Delete slot
                        </Button>
                      </div>
                      {targets.length > 0 && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                          <label className="block min-w-0 flex-1 text-xs font-medium text-ink-500">
                            Transfer attendees to
                            <Select
                              className="mt-1 min-h-11 w-full"
                              value={transferTo[slot.id] ?? ''}
                              onChange={(e) =>
                                setTransferTo((prev) => ({ ...prev, [slot.id]: e.target.value }))
                              }
                            >
                              <option value="">Select another slot…</option>
                              {targets.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {(t.title?.trim() || t.time) +
                                    ` · ${t.date} ${t.time} (${t.booked}/${t.capacity})`}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <Button
                            variant="secondary"
                            className="min-h-11"
                            disabled={!transferTo[slot.id]}
                            onClick={() => {
                              const toId = transferTo[slot.id]
                              if (!toId) return
                              const ok = onTransferSlot(slot.id, toId)
                              if (!ok) {
                                window.alert(
                                  'Could not transfer — target slot may no longer have capacity.',
                                )
                                return
                              }
                              setTransferTo((prev) => {
                                const next = { ...prev }
                                delete next[slot.id]
                                return next
                              })
                              setExpandedId(toId)
                            }}
                          >
                            Transfer slot
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
        {!propertySlots.length && (
          <li className="py-8 text-center">
            <p className="text-sm text-ink-500">No viewing slots published for this property.</p>
            {canManage && (
              <Button
                variant="secondary"
                className="mt-3 min-h-11 gap-1.5 cursor-pointer"
                onClick={() => setModalOpen(true)}
              >
                <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Add viewing slot
              </Button>
            )}
          </li>
        )}
      </ul>

      <ListPagination
        page={paged.page}
        totalPages={paged.totalPages}
        total={paged.total}
        pageSize={paged.pageSize}
        onPageChange={setPage}
        label="slots"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create viewing slot"
        description="Publish a time people can apply to join."
        size="md"
        footer={
          <>
            <Button variant="secondary" className="min-h-11" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="min-h-11"
              disabled={!draft.date || !draft.time || !draft.agentId}
              onClick={() => {
                onCreateSlot({
                  agencyId,
                  propertyId,
                  agentId: draft.agentId,
                  date: draft.date,
                  time: draft.time,
                  capacity: Number(draft.capacity) || 4,
                  title: draft.title.trim() || undefined,
                  notes: draft.notes.trim() || undefined,
                  durationMinutes: Number(draft.durationMinutes) || 45,
                })
                setModalOpen(false)
              }}
            >
              Publish viewing
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs font-medium text-ink-500">
            Title
            <Input
              className="mt-1 min-h-11"
              placeholder="e.g. Morning open house"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-ink-500">
              Date
              <Input
                type="date"
                className="mt-1 min-h-11"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-ink-500">
              Start time
              <Input
                type="time"
                className="mt-1 min-h-11"
                value={draft.time}
                onChange={(e) => setDraft({ ...draft, time: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-ink-500">
              Capacity
              <Input
                type="number"
                className="mt-1 min-h-11 tabular"
                value={draft.capacity}
                onChange={(e) => setDraft({ ...draft, capacity: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-ink-500">
              Duration (min)
              <Input
                type="number"
                className="mt-1 min-h-11 tabular"
                value={draft.durationMinutes}
                onChange={(e) => setDraft({ ...draft, durationMinutes: e.target.value })}
              />
            </label>
          </div>
          <PropertyAgentField
            propertyAgentId={agentId}
            agents={agents}
            value={draft.agentId}
            onChange={(id) => setDraft({ ...draft, agentId: id })}
          />
          <label className="block text-xs font-medium text-ink-500">
            Notes
            <Textarea
              className="mt-1 min-h-[5rem]"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
        </div>
      </Modal>

      <EditViewingSlotModal
        open={Boolean(editSlot)}
        slot={editSlot}
        onClose={() => setEditSlotId(null)}
        onSave={saveSlotEdit}
      />
    </Card>
  )
}
