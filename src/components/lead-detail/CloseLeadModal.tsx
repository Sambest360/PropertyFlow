import { useEffect, useState, type FormEvent } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Button, Modal, Textarea } from '../ui'
import {
  closeOutcomeMeta,
  closeOutcomesForLeadType,
  type ClosedLeadStage,
} from '../../lib/leadLifecycle'
import { ICON_STROKE } from './types'

export function CloseLeadModal({
  open,
  leadName,
  leadType,
  onClose,
  onConfirm,
}: {
  open: boolean
  leadName: string
  leadType: 'Buy' | 'Rent'
  onClose: () => void
  onConfirm: (input: { stage: ClosedLeadStage; reason: string }) => void
}) {
  const outcomes = closeOutcomesForLeadType(leadType)
  const [stage, setStage] = useState<ClosedLeadStage>(outcomes[0])
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setStage(outcomes[0])
    setReason('')
    setError('')
  }, [open, leadType, outcomes])

  const selected = closeOutcomeMeta(stage)

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = reason.trim()
    if (trimmed.length < 4) {
      setError('Enter a brief reason (at least 4 characters).')
      return
    }
    onConfirm({ stage, reason: trimmed })
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
      description={`Choose how “${leadName}” closed, then add a short note. The lead moves to History as ${closeOutcomeMeta(stage).label.toLowerCase()}.`}
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
          <Button
            variant={selected.tone === 'danger' ? 'danger' : 'primary'}
            className="min-h-11 cursor-pointer"
            onClick={() => submit()}
          >
            {selected.tone === 'danger' ? (
              <XCircle className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            )}
            Close as {selected.label.toLowerCase()}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="text-sm font-medium text-ink">How did this enquiry close?</legend>
          <div className="mt-2 grid gap-2">
            {outcomes.map((option) => {
              const meta = closeOutcomeMeta(option)
              const active = stage === option
              const Icon = meta.tone === 'danger' ? XCircle : CheckCircle2
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setStage(option)
                    setError('')
                  }}
                  className={`flex min-h-11 w-full cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    active
                      ? meta.tone === 'danger'
                        ? 'border-accent bg-accent-50'
                        : 'border-primary bg-primary-50'
                      : 'border-primary-100 bg-white hover:bg-primary-50/60'
                  }`}
                  aria-pressed={active}
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      active
                        ? meta.tone === 'danger'
                          ? 'text-accent'
                          : 'text-primary'
                        : 'text-ink-400'
                    }`}
                    strokeWidth={ICON_STROKE}
                    aria-hidden
                  />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{meta.label}</span>
                    <span className="mt-0.5 block text-sm text-ink-500">{meta.blurb}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <label className="block text-sm font-medium text-ink">
          Notes for the record
          <Textarea
            className="mt-1.5 min-h-24"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setError('')
            }}
            placeholder={
              stage === 'Rejected'
                ? 'e.g. Chose another property, budget changed, unresponsive after follow-ups…'
                : stage === 'Lease Signed'
                  ? 'e.g. Lease signed 1 Aug, move-in 15 Aug, deposit received…'
                  : 'e.g. Transfer registered, sale concluded 1 Aug…'
            }
            required
          />
        </label>
        {error ? (
          <p className="rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-800" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  )
}
