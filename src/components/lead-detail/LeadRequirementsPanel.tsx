import { useRef, useState } from 'react'
import { Banknote, CheckCircle2, Circle, FileText, Paperclip, StickyNote } from 'lucide-react'
import type { Lead, LeadRequirementCompletion, LeadStageRequirement } from '../../types/domain'
import { Badge, Button, Input, Textarea, cn } from '../ui'
import { formatZAR } from '../../data/seed'
import {
  completionFor,
  isRequirementMet,
  type LeadRequirementKind,
} from '../../lib/leadRequirements'
import { FileValidationError, toStorageRef } from '../../lib/storage/contract'
import { getFileStorage } from '../../lib/storage'
import { leadDocumentTarget } from '../../lib/storage/targets'
import { MediaLink } from '../media/MediaImage'

const ICON_STROKE = 1.6

const KIND_HINT: Record<LeadRequirementKind, string> = {
  note: 'Add a note and mark it done.',
  document: 'Attach the document to complete this.',
  payment: 'Record the payment amount and reference.',
  check: 'Tick once confirmed.',
}

/**
 * The configured requirements for the lead's current step, with the controls
 * agents use to complete each one. Satisfying required items unlocks moving
 * the lead to the next step.
 */
export function LeadRequirementsPanel({
  lead,
  stageLabel,
  requirements,
  canManage,
  onComplete,
}: {
  lead: Lead
  stageLabel: string
  requirements: LeadStageRequirement[]
  canManage: boolean
  onComplete: (requirementId: string, patch: Partial<LeadRequirementCompletion>) => void
}) {
  if (requirements.length === 0) return null

  const metCount = requirements.filter((r) =>
    isRequirementMet(completionFor(lead, lead.stage, r.id), r),
  ).length

  return (
    <section
      aria-label={`Requirements for ${stageLabel}`}
      className="rounded-[1.25rem] border border-primary-100/80 bg-white p-5 shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)]"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-ink">
          Step requirements — {stageLabel}
        </h3>
        <Badge tone={metCount === requirements.length ? 'success' : 'info'} className="shrink-0">
          {metCount} of {requirements.length} done
        </Badge>
      </div>
      <p className="mb-4 text-sm text-ink-500">
        Complete what this step needs — required items must be done before the lead can move
        forward.
      </p>
      <ul className="space-y-2">
        {requirements.map((requirement) => (
          <li key={requirement.id}>
            <RequirementRow
              lead={lead}
              requirement={requirement}
              canManage={canManage}
              onComplete={onComplete}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function RequirementRow({
  lead,
  requirement,
  canManage,
  onComplete,
}: {
  lead: Lead
  requirement: LeadStageRequirement
  canManage: boolean
  onComplete: (requirementId: string, patch: Partial<LeadRequirementCompletion>) => void
}) {
  const completion = completionFor(lead, lead.stage, requirement.id)
  const met = isRequirementMet(completion, requirement)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const setDone = (done: boolean, extra?: Partial<LeadRequirementCompletion>) =>
    onComplete(requirement.id, { done, ...extra })

  async function attachFile(file: File) {
    setUploadError(null)
    setUploading(true)
    try {
      const result = await getFileStorage().upload({
        ...leadDocumentTarget(lead.agencyId, lead.id, requirement.id),
        file,
      })
      setDone(true, {
        file: {
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataUrl: toStorageRef(result.file_id),
          fileId: result.file_id,
          uploadedAt: new Date().toISOString(),
        },
        note: completion?.note,
      })
    } catch (err) {
      setUploadError(
        err instanceof FileValidationError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'That file could not be uploaded.',
      )
    } finally {
      setUploading(false)
    }
  }

  const icon =
    requirement.kind === 'document' ? (
      <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
    ) : requirement.kind === 'payment' ? (
      <Banknote className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
    ) : requirement.kind === 'note' ? (
      <StickyNote className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
    ) : (
      <CheckCircle2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
    )

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors duration-200',
        met ? 'border-primary-200 bg-primary-50/50' : 'border-primary-50 bg-white',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            met ? 'bg-primary text-white' : 'bg-primary-50 text-primary',
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold text-ink', met && 'text-primary')}>
            {requirement.label}
          </p>
          {requirement.description ? (
            <p className="mt-0.5 text-xs text-ink-500">{requirement.description}</p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-400">{KIND_HINT[requirement.kind]}</p>
          )}
          {requirement.required ? null : (
            <Badge tone="neutral" className="mt-1">
              Optional
            </Badge>
          )}
          {completion?.note ? (
            <p className="mt-1.5 rounded-lg bg-primary-50 px-2.5 py-1.5 text-xs text-ink-600">
              {completion.note}
            </p>
          ) : null}
          {completion?.amount != null ? (
            <p className="mt-1.5 text-xs font-semibold text-ink tabular">
              {formatZAR(completion.amount)}
              {completion.reference ? (
                <span className="font-normal text-ink-500"> · ref {completion.reference}</span>
              ) : null}
            </p>
          ) : null}
          {completion?.file ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-2.5 py-1.5 text-xs text-ink-600">
              <Paperclip className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              <MediaLink href={completion.file.dataUrl} className="truncate font-medium text-primary hover:underline">
                {completion.file.name}
              </MediaLink>
            </p>
          ) : null}
          {uploadError ? <p className="mt-1.5 text-xs font-medium text-accent">{uploadError}</p> : null}

          {canManage && requirement.kind === 'document' ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) attachFile(file)
                  e.target.value = ''
                }}
                aria-label={`Attach file for ${requirement.label}`}
              />
              <Button
                type="button"
                variant="secondary"
                className="min-h-9 cursor-pointer px-3 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                {uploading ? 'Uploading…' : completion?.file ? 'Replace file' : 'Attach file'}
              </Button>
              {completion?.done ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-9 cursor-pointer px-3 text-xs"
                  onClick={() => setDone(false, { file: undefined })}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ) : null}

          {canManage && requirement.kind === 'payment' ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="Amount (R)"
                className="min-h-10 w-36"
                defaultValue={completion?.amount ?? undefined}
                onBlur={(e) => {
                  const amount = Number(e.target.value)
                  if (!Number.isFinite(amount) || amount <= 0) return
                  setDone(true, { amount })
                }}
                aria-label={`Amount paid for ${requirement.label}`}
              />
              <Input
                placeholder="Reference"
                className="min-h-10 w-44"
                defaultValue={completion?.reference ?? ''}
                onBlur={(e) => {
                  const reference = e.target.value.trim()
                  if (!reference) return
                  setDone(true, { reference })
                }}
                aria-label={`Payment reference for ${requirement.label}`}
              />
            </div>
          ) : null}

          {canManage && (requirement.kind === 'note' || requirement.kind === 'check') ? (
            <div className="mt-2 space-y-2">
              {requirement.kind === 'note' ? (
                <Textarea
                  rows={2}
                  placeholder="What happened at this step?"
                  defaultValue={completion?.note ?? ''}
                  onBlur={(e) => {
                    const note = e.target.value.trim()
                    if (note) setDone(true, { note })
                  }}
                  aria-label={`Note for ${requirement.label}`}
                />
              ) : null}
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-primary"
                  checked={Boolean(completion?.done)}
                  onChange={(e) => setDone(e.target.checked)}
                  aria-label={`Mark "${requirement.label}" as done`}
                />
                {completion?.done ? 'Done' : 'Mark as done'}
              </label>
            </div>
          ) : null}
        </div>
        <span aria-hidden className="mt-0.5 shrink-0">
          {met ? (
            <CheckCircle2 className="h-5 w-5 text-primary" strokeWidth={ICON_STROKE} />
          ) : (
            <Circle className="h-5 w-5 text-primary-200" strokeWidth={ICON_STROKE} />
          )}
        </span>
      </div>
    </div>
  )
}
