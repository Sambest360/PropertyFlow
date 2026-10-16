import { useMemo, useState } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import type { AppUser, Lead, PropertyAsset, Viewing, ViewingSlot } from '../../types/domain'
import {
  CreateViewingModal,
  type CreateViewingPayload,
} from '../viewings/CreateViewingModal'
import { Button, Modal, cn } from '../ui'
import {
  bookableSlotsForProperty,
  leadAlreadyOnSlot,
  leadToViewingGuest,
  remainingSlotPlaces,
} from '../../lib/leadViewing'
const ICON_STROKE = 1.6

export function ScheduleLeadViewingModal({
  open,
  lead,
  property,
  slots,
  viewings,
  agents,
  disabled,
  disabledReason,
  onClose,
  onBookSlot,
  onCreate,
}: {
  open: boolean
  lead: Lead
  property: PropertyAsset | null
  slots: readonly ViewingSlot[]
  viewings: readonly Viewing[]
  agents: AppUser[]
  disabled?: boolean
  disabledReason?: string
  onClose: () => void
  onBookSlot: (slotId: string) => void
  onCreate: (payload: CreateViewingPayload) => void
}) {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const bookable = useMemo(
    () => (property ? bookableSlotsForProperty(slots, property.id) : []),
    [slots, property],
  )

  const reset = () => {
    setSelectedSlotId(null)
    setSlotError(null)
    setCreateOpen(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const confirmSlot = () => {
    if (!selectedSlotId) {
      setSlotError('Choose an open slot.')
      return
    }
    if (leadAlreadyOnSlot(lead, selectedSlotId, viewings)) {
      setSlotError('This lead is already booked on that slot.')
      return
    }
    const slot = bookable.find((s) => s.id === selectedSlotId)
    if (!slot || remainingSlotPlaces(slot) < 1) {
      setSlotError('That slot is full.')
      return
    }
    setSlotError(null)
    onBookSlot(selectedSlotId)
    reset()
  }

  if (createOpen && property) {
    return (
      <CreateViewingModal
        open={open}
        onClose={() => setCreateOpen(false)}
        properties={[property]}
        agents={agents}
        defaultPropertyId={property.id}
        lockProperty
        defaultGuests={[leadToViewingGuest(lead)]}
        onSubmit={(payload) => {
          onCreate(payload)
          setCreateOpen(false)
          reset()
        }}
      />
    )
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Schedule viewing"
      description="Book this lead onto an open slot or create a new slot or direct booking."
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" className="min-h-11" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={disabled || !selectedSlotId}
            onClick={confirmSlot}
          >
            Book selected slot
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-600">
          <span className="font-semibold text-ink">{lead.name}</span>
          {lead.email ? <span className="text-ink-500"> · {lead.email}</span> : null}
        </p>

        {disabled ? (
          <p className="rounded-xl border border-accent-100 bg-accent-50/50 px-3 py-2 text-sm text-accent">
            {disabledReason ?? 'You cannot schedule viewings for this property.'}
          </p>
        ) : null}

        <div>
          <p className="text-xs font-medium text-ink-500">Open slots on this listing</p>
          {bookable.length === 0 ? (
            <p className="mt-2 text-sm text-ink-500">No open slots with space left. Create a new viewing below.</p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto [scrollbar-width:thin]">
              {bookable.map((slot) => {
                const onSlot = leadAlreadyOnSlot(lead, slot.id, viewings)
                const places = remainingSlotPlaces(slot)
                const selected = selectedSlotId === slot.id
                return (
                  <li key={slot.id}>
                    <button
                      type="button"
                      disabled={disabled || onSlot}
                      onClick={() => {
                        setSelectedSlotId(slot.id)
                        setSlotError(null)
                      }}
                      className={cn(
                        'flex w-full min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                        selected
                          ? 'border-primary bg-primary-50'
                          : 'border-primary-100 hover:border-primary-200',
                        (disabled || onSlot) && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <CalendarDays className="h-4 w-4 shrink-0 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-ink">
                          {slot.date} · {slot.time}
                        </span>
                        {slot.title ? (
                          <span className="mt-0.5 block truncate text-xs text-ink-500">{slot.title}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-xs tabular text-ink-500">
                        {onSlot ? 'Already booked' : `${places} left`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {slotError ? <p className="mt-2 text-sm text-accent">{slotError}</p> : null}
        </div>

        <Button
          type="button"
          variant="secondary"
          className="min-h-11 w-full gap-2"
          disabled={disabled || !property}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          Create new slot or booking
        </Button>
      </div>
    </Modal>
  )
}
