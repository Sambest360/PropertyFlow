import { useId, useRef, useState } from 'react'
import { FileText, Upload, X } from 'lucide-react'
import type { VerificationDocument } from '../../lib/verification'
import { REGISTRATION_DOC_MAX_BYTES, formatDocSizeLabel } from '../../lib/auth/registrationDocs'
import { showAuthWarning } from '../../lib/sweetAlert'
import { cn } from '../ui'

const ICON_STROKE = 1.6
const ACCEPT =
  'image/jpeg,image/png,image/webp,application/pdf,.pdf,.jpg,.jpeg,.png,.webp'
const MAX_LABEL = formatDocSizeLabel()

function readFile(file: File): Promise<{ name: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataUrl: String(reader.result),
      })
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

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
  value: VerificationDocument | null
  onChange: (doc: VerificationDocument | null) => void
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [sizeError, setSizeError] = useState<string | null>(null)

  const onPick = async (file: File | null) => {
    if (!file) return
    if (file.size > REGISTRATION_DOC_MAX_BYTES) {
      if (inputRef.current) inputRef.current.value = ''
      const message = `File too large. Use a file under ${MAX_LABEL}.`
      setSizeError(message)
      await showAuthWarning(message)
      return
    }
    setSizeError(null)
    try {
      const read = await readFile(file)
      onChange({
        key: docKey,
        label,
        name: read.name,
        mimeType: read.mimeType,
        dataUrl: read.dataUrl,
        uploadedAt: new Date().toISOString(),
      })
    } catch {
      await showAuthWarning('Could not read that file — try a different PDF or image.')
    }
  }

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
          ) : null}
        </div>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full text-ink-400 transition-colors duration-200 hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Remove ${label}`}
          >
            <X className="h-4 w-4" strokeWidth={ICON_STROKE} />
          </button>
        ) : null}
      </div>

      {value ? (
        <div className="mt-2 flex items-center gap-2 text-sm text-ink-600">
          {value.mimeType.startsWith('image/') ? (
            <img
              src={value.dataUrl}
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
          Upload PDF or image (max {MAX_LABEL})
        </button>
      )}
      {sizeError ? (
        <p className="mt-2 text-xs text-accent" role="alert">
          {sizeError}
        </p>
      ) : null}

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
