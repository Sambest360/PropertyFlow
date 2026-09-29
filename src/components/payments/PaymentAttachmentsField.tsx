import { useCallback, useId, useRef, useState, type DragEvent } from 'react'
import { FileText, ImagePlus, Paperclip, Upload, X } from 'lucide-react'
import type { PaymentAttachment } from '../../types/domain'
import type { StorageUploadTarget } from '../../lib/storage/contract'
import { FileValidationError, toStorageRef } from '../../lib/storage/contract'
import { getFileStorage } from '../../lib/storage'
import { MediaImage, MediaLink } from '../media/MediaImage'
import { cn } from '../ui'

const ICON_STROKE = 1.6
const ACCEPT = 'image/jpeg,image/png,application/pdf,.pdf,.jpg,.jpeg,.png'
const MAX_FILES = 6

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

async function uploadAttachment(
  file: File,
  storage: StorageUploadTarget,
  uploadedByName?: string | null,
): Promise<PaymentAttachment> {
  const result = await getFileStorage().upload({ ...storage, file })
  const kind = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    ? 'document'
    : 'image'
  return {
    id: result.file_id || uid('att'),
    name: file.name,
    kind,
    mimeType: file.type || (kind === 'document' ? 'application/pdf' : 'image/jpeg'),
    dataUrl: toStorageRef(result.file_id),
    fileId: result.file_id,
    uploadedAt: new Date().toISOString(),
    uploadedByName: uploadedByName ?? null,
  }
}

export function PaymentAttachmentsList({
  attachments,
  onRemove,
  disabled,
}: {
  attachments: PaymentAttachment[]
  onRemove?: (id: string) => void
  disabled?: boolean
}) {
  if (!attachments.length) {
    return <p className="text-sm text-ink-500">No attachments yet.</p>
  }

  return (
    <ul className="space-y-2">
      {attachments.map((att) => (
        <li
          key={att.id}
          className="flex items-center gap-3 rounded-xl border border-primary-100 bg-white px-3 py-2"
        >
          {att.kind === 'image' ? (
            <MediaImage
              src={att.dataUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-primary-100"
            />
          ) : (
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary ring-1 ring-primary-100">
              <FileText className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{att.name}</p>
            <p className="text-xs text-ink-500">
              {att.uploadedByName ? `${att.uploadedByName} · ` : ''}
              {new Date(att.uploadedAt).toLocaleDateString()}
            </p>
          </div>
          <MediaLink
            href={att.dataUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-full text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Open ${att.name}`}
          >
            <Paperclip className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          </MediaLink>
          {!disabled && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(att.id)}
              className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full text-ink-400 transition-colors duration-200 hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`Remove ${att.name}`}
            >
              <X className="h-4 w-4" strokeWidth={ICON_STROKE} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

export function PaymentAttachmentsField({
  value,
  onChange,
  uploadedByName,
  disabled,
  label = 'Proof of payment',
  hint = 'PDF, JPEG, or PNG up to 20 MB each (max 6 files)',
  storage,
}: {
  value: PaymentAttachment[]
  onChange: (next: PaymentAttachment[]) => void
  uploadedByName?: string | null
  disabled?: boolean
  label?: string
  hint?: string
  storage: StorageUploadTarget
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remaining = Math.max(0, MAX_FILES - value.length)
  const canAdd = !disabled && remaining > 0

  const addFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || !canAdd) return
      setError(null)
      const list = Array.from(files)
      if (list.length === 0) return
      const slice = list.slice(0, remaining)
      try {
        const next: PaymentAttachment[] = []
        for (const file of slice) {
          next.push(await uploadAttachment(file, storage, uploadedByName))
        }
        onChange([...value, ...next].slice(0, MAX_FILES))
      } catch (err) {
        setError(
          err instanceof FileValidationError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not upload that file. Try another.',
        )
      }
    },
    [canAdd, onChange, remaining, storage, uploadedByName, value],
  )

  const removeAt = (id: string) => {
    onChange(value.filter((a) => a.id !== id))
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    if (!canAdd) return
    void addFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-3">
      {label && (
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-ink-500">{label}</p>
          <span className="tabular text-[11px] text-ink-400">
            {value.length} / {MAX_FILES}
          </span>
        </div>
      )}

      <PaymentAttachmentsList attachments={value} onRemove={removeAt} disabled={disabled} />

      {canAdd && (
        <label
          htmlFor={inputId}
          onDragEnter={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            if (e.currentTarget.contains(e.relatedTarget as Node)) return
            setDragging(false)
          }}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors duration-200',
            dragging
              ? 'border-primary bg-primary-50 text-primary'
              : 'border-primary-200 bg-primary-50/40 text-ink-500 hover:border-primary hover:bg-primary-50 hover:text-primary',
            'focus-within:outline-none focus-within:ring-2 focus-within:ring-primary',
          )}
        >
          <span
            className={cn(
              'inline-flex h-10 w-10 items-center justify-center rounded-full',
              dragging ? 'bg-primary text-white' : 'bg-white text-primary shadow-sm',
            )}
            aria-hidden
          >
            {dragging ? (
              <Upload className="h-5 w-5" strokeWidth={ICON_STROKE} />
            ) : (
              <ImagePlus className="h-5 w-5" strokeWidth={ICON_STROKE} />
            )}
          </span>
          <span className="text-sm font-semibold text-ink">Add receipt or proof</span>
          <span className="max-w-xs text-xs text-ink-400">{hint}</span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            multiple={remaining > 1}
            disabled={!canAdd}
            className="sr-only"
            onChange={(e) => {
              void addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-accent">
          {error}
        </p>
      )}
    </div>
  )
}
