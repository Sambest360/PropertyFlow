import { useEffect, useState } from 'react'
import type { Application, ApplicationDocument } from '../../types/domain'
import type { HateoasAction } from '../../lib/api/contracts'
import {
  getActionFormSpec,
  validateActionCapture,
  type WorkflowActionCapture,
} from '../../lib/workflowActionForms'
import { SignaturePad } from './SignaturePad'
import { Button, Input, Modal, Textarea, Badge, statusTone } from '../ui'

export function WorkflowActionModal({
  open,
  action,
  application,
  busy,
  onClose,
  onConfirm,
  onSetDocument,
}: {
  open: boolean
  action: HateoasAction | null
  application: Application
  busy?: boolean
  onClose: () => void
  onConfirm: (capture: WorkflowActionCapture) => void
  onSetDocument?: (key: string, status: ApplicationDocument['status']) => void
}) {
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
    if (spec.kind === 'upload' && !application.documents.every((d) => d.status !== 'required')) {
      setError('Upload or verify all required documents first.')
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
              <li
                key={doc.key}
                className="flex items-center justify-between gap-3 rounded-xl border border-primary-100 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{doc.label}</p>
                  {doc.note ? <p className="text-xs text-ink-500">{doc.note}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={statusTone(doc.status)}>{doc.status}</Badge>
                  {onSetDocument && doc.status === 'required' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-9 px-3 text-xs"
                      onClick={() => onSetDocument(doc.key, 'uploaded')}
                    >
                      Mark uploaded
                    </Button>
                  ) : null}
                </div>
              </li>
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
