import { useEffect, useState } from 'react'
import type { Application, ApplicationDocument } from '../../types/domain'
import type { HateoasAction } from '../../lib/api/contracts'
import {
  getActionFormSpec,
  validateActionCapture,
  type WorkflowActionCapture,
} from '../../lib/workflowActionForms'
import { useStore } from '../../context/AppStore'
import { ApplicationDocumentRow } from '../applicant-detail/ApplicationDocumentRow'
import { SignaturePad } from './SignaturePad'
import { Button, Input, Modal, Textarea } from '../ui'

export function WorkflowActionModal({
  open,
  action,
  application,
  busy,
  onClose,
  onConfirm,
  onSetDocument,
  onUploadDocument,
}: {
  open: boolean
  action: HateoasAction | null
  application: Application
  busy?: boolean
  onClose: () => void
  onConfirm: (capture: WorkflowActionCapture) => void
  onSetDocument?: (key: string, status: ApplicationDocument['status'], note?: string) => void
  onUploadDocument?: (
    key: string,
    file: { name: string; mimeType: string; dataUrl: string },
  ) => void
}) {
  const { state } = useStore()
  const leaseId = state.tenancies.find((t) => t.applicationId === application.id)?.id ?? null
  const [capture, setCapture] = useState<WorkflowActionCapture>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !action) return
    setCapture({})
    setError(null)
  }, [open, action?.key])

  if (!action) return null

  const spec = getActionFormSpec(action.key, application)
  const destructive = action.key.includes('REJECT') || action.key.includes('DECLINE') || action.key.includes('CANCEL') || action.key === 'WITHDRAW'

  const submit = () => {
    const validationError = validateActionCapture(spec, capture)
    if (validationError) {
      setError(validationError)
      return
    }
    if (spec.kind === 'upload' && !application.documents.every((d) => d.status === 'uploaded' || d.status === 'verified')) {
      setError('Upload all required documents first.')
      return
    }
    setError(null)
    onConfirm(capture)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={spec.title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" className="min-h-11" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="min-h-11"
            variant={destructive ? 'danger' : 'primary'}
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'Saving…' : spec.confirmLabel ?? action.label}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-600">{spec.description}</p>
        {action.confirm ? (
          <p className="rounded-xl border border-accent-200 bg-accent-50/70 px-3 py-2 text-sm text-accent-900">
            {action.confirm}
          </p>
        ) : null}

        {spec.showDocumentChecklist ? (
          <ul className="space-y-2">
            {application.documents.map((doc) => (
              <ApplicationDocumentRow
                key={doc.key}
                doc={doc}
                canUpload={Boolean(onUploadDocument)}
                canReview={Boolean(onSetDocument)}
                onUpload={(file) => onUploadDocument?.(doc.key, file)}
                onSetStatus={(status, note) => onSetDocument?.(doc.key, status, note)}
                uploadTarget={{
                  agencyId: application.agencyId,
                  applicationId: application.id,
                  leaseId,
                }}
              />
            ))}
          </ul>
        ) : null}

        {(spec.fields ?? []).map((field) => {
          const value = capture[field.key] ?? ''
          const set = (next: string) => setCapture((prev) => ({ ...prev, [field.key]: next }))
          if (field.type === 'textarea') {
            return (
              <div key={field.key}>
                <label className="mb-1.5 block text-sm font-medium text-ink">{field.label}</label>
                <Textarea
                  value={String(value)}
                  onChange={(e) => set(e.target.value)}
                  placeholder={field.placeholder}
                  rows={3}
                  className="min-h-[5.5rem]"
                />
              </div>
            )
          }
          return (
            <div key={field.key}>
              <label className="mb-1.5 block text-sm font-medium text-ink">
                {field.label}
                {field.required ? <span className="text-accent"> *</span> : null}
              </label>
              <Input
                type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                value={String(value)}
                onChange={(e) => set(e.target.value)}
                placeholder={field.placeholder}
                className="min-h-11"
              />
            </div>
          )
        })}

        {spec.kind === 'signature' ? (
          <SignaturePad
            value={capture.signatureDataUrl}
            onChange={(dataUrl) => setCapture((prev) => ({ ...prev, signatureDataUrl: dataUrl ?? undefined }))}
          />
        ) : null}

        {error ? (
          <p role="alert" className="rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-900">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
