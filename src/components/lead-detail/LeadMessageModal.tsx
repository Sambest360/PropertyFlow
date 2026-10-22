import { useEffect, useState, type FormEvent } from 'react'
import { Button, Modal, Textarea } from '../ui'
import { MESSAGING_MODE_A_SHORT } from '../../lib/messaging/modeA'

export function LeadMessageModal({
  open,
  leadName,
  onClose,
  onSend,
}: {
  open: boolean
  leadName: string
  onClose: () => void
  onSend: (body: string) => void
}) {
  const [body, setBody] = useState('')

  useEffect(() => {
    if (!open) setBody('')
  }, [open])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = body.trim()
    if (trimmed.length < 2) return
    onSend(trimmed)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Message ${leadName}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-ink-500">{MESSAGING_MODE_A_SHORT}</p>
        <Textarea
          rows={4}
          placeholder="Write your message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="min-h-11" disabled={body.trim().length < 2}>
            Send
          </Button>
        </div>
      </form>
    </Modal>
  )
}
