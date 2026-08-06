import { useEffect, useState, type FormEvent } from 'react'
import type { ViewingSlot } from '../../types/domain'
import { Button, Input, Modal, Textarea } from '../ui'

export type EditViewingSlotPayload = {
  title?: string
  date: string
  time: string
  capacity: number
  durationMinutes?: number
  notes?: string
}

export function EditViewingSlotModal({
  open,
  slot,
  onClose,
  onSave,
}: {
  open: boolean
  slot: ViewingSlot | null
  onClose: () => void
  onSave: (payload: EditViewingSlotPayload) => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [capacity, setCapacity] = useState('4')
  const [durationMinutes, setDurationMinutes] = useState('45')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !slot) return
    setTitle(slot.title ?? '')
    setDate(slot.date)
    setTime(slot.time)
    setCapacity(String(slot.capacity))
    setDurationMinutes(String(slot.durationMinutes ?? 45))
    setNotes(slot.notes ?? '')
    setError(null)
  }, [open, slot])

  if (!slot) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const cap = Math.max(1, Number(capacity) || 1)
    if (cap < slot.booked) {
      setError(`Capacity cannot be below ${slot.booked} — that many people are already booked.`)
      return
    }
    if (!date || !time) {
      setError('Pick a date and time.')
      return
    }
    onSave({
      title: title.trim() || undefined,
      date,
      time,
      capacity: cap,
      durationMinutes: Math.max(15, Number(durationMinutes) || 45),
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit viewing slot"
      description="Changes are saved to this slot and attendees with accounts are notified."
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-viewing-slot-form" className="min-h-11">
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-viewing-slot-form" className="space-y-3" onSubmit={submit}>
        <label className="block text-xs font-medium text-ink-500">
          Title
          <Input
            className="mt-1 min-h-11"
            placeholder="e.g. Saturday open house"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
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
          <label className="block text-xs font-medium text-ink-500">
            Capacity
            <Input
              type="number"
              min={slot.booked}
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
        <label className="block text-xs font-medium text-ink-500">
          Notes
          <Textarea
            className="mt-1 min-h-20"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Access instructions, parking, keys…"
          />
        </label>
        {slot.booked > 0 && (
          <p className="text-xs text-ink-500">
            {slot.booked} {slot.booked === 1 ? 'person has' : 'people have'} booked this slot and will
            be notified if the schedule changes.
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs font-medium text-accent">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
