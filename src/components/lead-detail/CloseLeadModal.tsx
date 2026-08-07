import { useState, type FormEvent } from 'react'
import { Archive } from 'lucide-react'
import { Button, Modal, Textarea } from '../ui'
import { ICON_STROKE } from './types'

export function CloseLeadModal({
  open,
  leadName,
  onClose,
  onConfirm,
}: {
  open: boolean
  leadName: string
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = reason.trim()
    if (trimmed.length < 4) {
      setError('Enter a brief reason (at least 4 characters).')
      return
    }
    onConfirm(trimmed)
    setReason('')
    setError('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setReason('')
        setError('')
        onClose()
      }}
      title="Close lead"
      description={`“${leadName}” will move to History as rejected. The reason is saved on the lead record.`}
      footer={
        <>
          <Button
            variant="secondary"
            className="min-h-11 cursor-pointer"
            onClick={() => {
              setReason('')
              setError('')
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button variant="danger" className="min-h-11 cursor-pointer" onClick={() => submit()}>
            <Archive className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Close lead
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <label className="block text-sm font-medium text-ink">
          Why is this enquiry closing?
          <Textarea
            className="mt-1.5 min-h-24"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setError('')
            }}
            placeholder="e.g. Chose another property, budget changed, unresponsive after follow-ups…"
            required
          />
        </label>
        {error ? (
          <p className="mt-3 rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-800" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
