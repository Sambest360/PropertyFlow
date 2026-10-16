import { useEffect, useState, type FormEvent } from 'react'
import { XCircle } from 'lucide-react'
import { Button, Modal, Textarea } from '../ui'

export function DeclineVerificationModal({
  open,
  subjectName,
  subjectRole,
  onClose,
  onConfirm,
}: {
  open: boolean
  subjectName: string
  subjectRole: string
  onClose: () => void
  onConfirm: (note: string) => void
}) {
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setNote('')
    setError('')
  }, [open, subjectName])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = note.trim()
    if (trimmed.length < 4) {
      setError('Enter a decline note (at least 4 characters).')
      return
    }
    onConfirm(trimmed)
    setNote('')
    setError('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setNote('')
        setError('')
        onClose()
      }}
      title="Decline verification"
      description={`“${subjectName}” (${subjectRole}) will be notified with your note. This cannot be undone from this screen.`}
      footer={
        <>
          <Button
            variant="secondary"
            className="min-h-11 cursor-pointer"
            onClick={() => {
              setNote('')
              setError('')
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button variant="danger" className="min-h-11 cursor-pointer" onClick={() => submit()}>
            <XCircle className="h-4 w-4" aria-hidden />
            Confirm decline
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <label className="block text-xs font-medium text-ink-500">
          Decline note <span className="text-accent">*</span>
          <Textarea
            className="mt-1 min-h-[6rem]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain what is missing or why verification cannot be approved…"
            required
          />
        </label>
        {error ? (
          <p className="mt-3 rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-800">{error}</p>
        ) : null}
      </form>
    </Modal>
  )
}
