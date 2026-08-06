import { useEffect, useState, type FormEvent } from 'react'
import type { Viewing } from '../../types/domain'
import { Button, Input, Modal, Textarea } from '../ui'

export type EditViewingBookingPayload = {
  date: string
  time: string
  notes?: string
}

export function EditViewingBookingModal({
  open,
  viewing,
  onClose,
  onSave,
}: {
  open: boolean
  viewing: Viewing | null
  onClose: () => void
  onSave: (payload: EditViewingBookingPayload) => void
}) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !viewing) return
    setDate(viewing.date)
    setTime(viewing.time)
    setNotes(viewing.notes ?? '')
    setError(null)
  }, [open, viewing])

  if (!viewing) return null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!date || !time) {
      setError('Pick a date and time.')
      return
    }
    onSave({ date, time, notes: notes.trim() || undefined })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit direct booking"
      description="Reschedule or update notes. The attendee will be notified if the date or time changes."
      size="md"
      footer={
        <>
          <Button type="button" variant="secondary" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-viewing-booking-form" className="min-h-11">
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-viewing-booking-form" className="space-y-3" onSubmit={submit}>
        <p className="text-sm text-ink-600">
          <span className="font-medium text-ink">{viewing.applicantName}</span>
          {viewing.applicantEmail ? (
            <span className="text-ink-500"> · {viewing.applicantEmail}</span>
          ) : null}
        </p>
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
        {error && (
          <p role="alert" className="text-xs font-medium text-accent">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
