import { useEffect, useState, type FormEvent } from 'react'
import { CalendarDays, DoorOpen, Users } from 'lucide-react'
import type { AppUser, PropertyAsset } from '../../types/domain'
import { PropertySearchPicker } from '../PropertySearchPicker'
import { PropertyAgentField } from './PropertyAgentField'
import { Button, Input, Modal, Textarea, cn } from '../ui'
import { GuestListEditor, type ViewingGuest } from './GuestListEditor'

const ICON_STROKE = 1.6

export type CreateViewingMode = 'slot' | 'booking'

export type CreateViewingPayload =
  | {
      mode: 'slot'
      propertyId: string
      agentId: string
      date: string
      time: string
      capacity: number
      title: string
      notes: string
      durationMinutes: number
      /** Optional people to book into the new slot immediately */
      guests: ViewingGuest[]
    }
  | {
      mode: 'booking'
      propertyId: string
      agentId: string
      date: string
      time: string
      notes: string
      guests: ViewingGuest[]
    }

export function CreateViewingModal({
  open,
  onClose,
  properties,
  agents,
  defaultPropertyId,
  defaultDate,
  defaultGuests,
  lockProperty,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  properties: PropertyAsset[]
  agents: AppUser[]
  defaultPropertyId?: string | null
  defaultDate?: string | null
  defaultGuests?: ViewingGuest[]
  /** When true, property cannot be changed (property workspace). */
  lockProperty?: boolean
  onSubmit: (payload: CreateViewingPayload) => void
}) {
  const [mode, setMode] = useState<CreateViewingMode>('slot')
  const [propertyId, setPropertyId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [date, setDate] = useState('2026-07-28')
  const [time, setTime] = useState('10:00')
  const [capacity, setCapacity] = useState('4')
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('45')
  const [guests, setGuests] = useState<ViewingGuest[]>([])
  const [error, setError] = useState<string | null>(null)

  const selected = properties.find((p) => p.id === propertyId)

  useEffect(() => {
    if (!open) return
    const initialProp =
      (defaultPropertyId && properties.find((p) => p.id === defaultPropertyId)?.id) ||
      properties[0]?.id ||
      ''
    setPropertyId(initialProp)
    setMode('slot')
    setDate(defaultDate || '2026-07-28')
    setTime('10:00')
    setCapacity('4')
    setTitle('')
    setNotes('')
    setDurationMinutes('45')
    setGuests(defaultGuests?.length ? [...defaultGuests] : [])
    setError(null)
    const prop = properties.find((p) => p.id === initialProp)
    setAgentId(prop?.agentId ?? '')
  }, [open, defaultPropertyId, defaultDate, defaultGuests, properties])

  useEffect(() => {
    if (selected?.agentId) {
      setAgentId(selected.agentId)
    } else {
      setAgentId('')
    }
  }, [selected?.id, selected?.agentId])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!propertyId) {
      setError('Select a property — every viewing must be linked to one.')
      return
    }
    if (!agentId) {
      setError(
        selected?.agentId
          ? 'Assign an agent for this viewing.'
          : 'This property has no linked agent. Assign one on the property before scheduling.',
      )
      return
    }
    if (!date || !time) {
      setError('Pick a date and time.')
      return
    }

    if (mode === 'slot') {
      const cap = Math.max(1, Number(capacity) || 1)
      if (guests.length > cap) {
        setError(`This slot only holds ${cap}. Remove people or raise capacity.`)
        return
      }
      onSubmit({
        mode: 'slot',
        propertyId,
        agentId,
        date,
        time,
        capacity: cap,
        title: title.trim(),
        notes: notes.trim(),
        durationMinutes: Math.max(15, Number(durationMinutes) || 45),
        guests,
      })
      onClose()
      return
    }

    if (guests.length === 0) {
      setError('Add at least one person for a direct booking.')
      return
    }
    onSubmit({
      mode: 'booking',
      propertyId,
      agentId,
      date,
      time,
      notes: notes.trim(),
      guests,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule a viewing"
      description="Link to a property, then publish an open slot or invite specific people / a group."
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-viewing-form" className="min-h-11">
            {mode === 'slot'
              ? guests.length
                ? `Publish slot · invite ${guests.length}`
                : 'Publish open slot'
              : `Book ${guests.length || ''} ${guests.length === 1 ? 'person' : 'people'}`.trim()}
          </Button>
        </>
      }
    >
      <form id="create-viewing-form" className="space-y-4" onSubmit={submit}>
        <div
          className="inline-flex min-h-11 w-full rounded-2xl border border-primary-100 bg-primary-50/40 p-1"
          role="group"
          aria-label="Create mode"
        >
          <button
            type="button"
            onClick={() => setMode('slot')}
            className={cn(
              'inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              mode === 'slot' ? 'bg-white text-primary shadow-sm' : 'text-ink-500 hover:text-ink',
            )}
            aria-pressed={mode === 'slot'}
          >
            <DoorOpen className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Open slot
          </button>
          <button
            type="button"
            onClick={() => setMode('booking')}
            className={cn(
              'inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              mode === 'booking' ? 'bg-white text-primary shadow-sm' : 'text-ink-500 hover:text-ink',
            )}
            aria-pressed={mode === 'booking'}
          >
            <Users className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Invite people
          </button>
        </div>

        <PropertySearchPicker
          properties={properties}
          value={propertyId}
          onChange={setPropertyId}
          required
          locked={lockProperty}
          id="viewing-property-search"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink-500">
            Date <span className="text-accent">*</span>
            <Input
              type="date"
              className="mt-1 min-h-11"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Time <span className="text-accent">*</span>
            <Input
              type="time"
              className="mt-1 min-h-11"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </label>
          <PropertyAgentField
            propertyAgentId={selected?.agentId}
            agents={agents}
            value={agentId}
            onChange={setAgentId}
            required
            className="sm:col-span-2"
          />
        </div>

        {mode === 'slot' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
              Slot title (optional)
              <Input
                className="mt-1 min-h-11"
                placeholder="e.g. Saturday open house"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-ink-500">
              Capacity
              <Input
                type="number"
                min={1}
                className="mt-1 min-h-11 tabular"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-ink-500">
              Duration (minutes)
              <Input
                type="number"
                min={15}
                step={15}
                className="mt-1 min-h-11 tabular"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </label>
          </div>
        )}

        <GuestListEditor
          guests={guests}
          onChange={setGuests}
          label={mode === 'slot' ? 'Pre-invite people (optional)' : 'Who is coming'}
          hint={
            mode === 'slot'
              ? 'Leave empty for a public open slot, or add people to book them in now.'
              : 'Add one applicant, or several for a group viewing at the same time.'
          }
        />

        <label className="block text-xs font-medium text-ink-500">
          Notes
          <Textarea
            className="mt-1 min-h-20"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Access instructions, parking, keys…"
          />
        </label>

        {error && (
          <p role="alert" className="text-xs font-medium text-accent">
            {error}
          </p>
        )}

        <p className="flex items-center gap-1.5 text-[11px] text-ink-400">
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
          All viewings stay linked to the selected property.
        </p>
      </form>
    </Modal>
  )
}
