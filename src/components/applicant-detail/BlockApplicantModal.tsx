import { useState, type FormEvent } from 'react'
import { Ban } from 'lucide-react'
import { Button, Modal, Textarea } from '../ui'
import { ICON_STROKE } from './types'

export function BlockApplicantModal({
  open,
  applicantName,
  onClose,
  onConfirm,
}: {
  open: boolean
  applicantName: string
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = reason.trim()
    if (trimmed.length < 8) {
      setError('Enter a clear reason (at least 8 characters).')
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
      title="Block applicant"
      description={`“${applicantName}” will be blocked from this property’s showings and listings. A reason is required.`}
      footer={
        <>
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={() => {
              setReason('')
              setError('')
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button variant="danger" className="min-h-11" onClick={() => submit()}>
            <Ban className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Block applicant
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <label className="block text-xs font-medium text-ink-500">
          Reason for block <span className="text-accent">*</span>
          <Textarea
            className="mt-1 min-h-[6rem]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. No-show at scheduled viewing after two confirmations; disruptive behaviour on site…"
            required
          />
        </label>
        {error && (
          <p className="mt-3 rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-800">{error}</p>
        )}
      </form>
    </Modal>
  )
}
