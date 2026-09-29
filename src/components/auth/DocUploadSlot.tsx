import { useEffect, useId, useRef } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import type { VerificationDocument } from '../../lib/verification'
import { validateUploadFile } from '../../lib/storage/contract'
import type { RegistrationDocDraft } from '../../lib/storage/registrationDocs'
import { showAuthWarning } from '../../lib/sweetAlert'
import { MediaImage } from '../media/MediaImage'
import { cn } from '../ui'

const ICON_STROKE = 1.6
const ACCEPT = 'image/jpeg,image/png,application/pdf,.pdf,.jpg,.jpeg,.png'

export function DocUploadSlot({
  docKey,
  label,
  required,
  value,
  onChange,
}: {
  docKey: string
  label: string
  required?: boolean
  value: RegistrationDocDraft | null
  onChange: (doc: RegistrationDocDraft | null) => void
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const preview = value?.localPreviewUrl

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const onPick = async (file: File | null) => {
    if (!file) return
    try {
      validateUploadFile(file, 'document')
    } catch (err) {
      await showAuthWarning(err instanceof Error ? err.message : 'That file cannot be uploaded.')
      return
    }
    if (value?.localPreviewUrl) URL.revokeObjectURL(value.localPreviewUrl)
    const next: RegistrationDocDraft = {
      key: docKey,
      label,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      dataUrl: '',
      uploadedAt: new Date().toISOString(),
      file,
      localPreviewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }
    onChange(next)
  }

  const previewSrc = value?.localPreviewUrl || value?.dataUrl || ''

  return (
    <div className="rounded-2xl border border-primary-100 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">
            {label}
            {required ? <span className="text-accent"> *</span> : null}
          </p>
          {!required ? (
            <p className="mt-0.5 text-xs text-ink-400">Optional</p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-400">PDF, JPEG, or PNG, up to 20 MB</p>
          )}
        </div>
        {value ? (
          <button
            type="button"
            onClick={() => {
              if (value.localPreviewUrl) URL.revokeObjectURL(value.localPreviewUrl)
              onChange(null)
            }}
            className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full text-ink-400 transition-colors duration-200 hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Remove ${label}`}
          >
            <X className="h-4 w-4" strokeWidth={ICON_STROKE} />
          </button>
        ) : null}
      </div>

      {value ? (
        <div className="mt-2 flex items-center gap-2 text-sm text-ink-600">
          {previewSrc && (value.mimeType.startsWith('image/') || previewSrc.startsWith('data:image/')) ? (
            <MediaImage
              src={previewSrc}
              alt=""
              className="h-10 w-10 rounded-lg object-cover ring-1 ring-primary-100"
            />
          ) : (
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary ring-1 ring-primary-100">
              <FileText className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
            </span>
          )}
          <span className="min-w-0 truncate font-medium">{value.name}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            'mt-2 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primary-200 bg-primary-50/40 px-3 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          )}
        >
          <Upload className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          Upload PDF or image (max 20 MB)
        </button>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

export type { VerificationDocument }
