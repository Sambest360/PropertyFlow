/**
 * Choose a document and it uploads straight away. While it is read and sent
 * the control shows a spinner, the file name and a moving bar; if the save
 * fails it says so and offers to try the same file again.
 */
import { useRef, useState } from 'react'
import { Loader2, RotateCcw, Upload } from 'lucide-react'
import {
  APPLICATION_DOC_ACCEPT,
  APPLICATION_DOC_MAX_BYTES,
  applicationDocFileError,
  applicationDocTypeError,
} from '../../lib/applicationDocUpload'
import { readDocumentFile } from '../../lib/applicationDocDownscale'
import { cn } from '../ui'

export type DocFile = { name: string; mimeType: string; dataUrl: string }

export function DocUploadButton({
  onUpload,
  label = 'Upload',
  variant = 'button',
  className,
  testId,
}: {
  /** Resolves false when the save failed. */
  onUpload: (file: DocFile) => Promise<boolean> | void
  label?: string
  /** `button`: outlined button; `link`: small text link for compact rows. */
  variant?: 'button' | 'link'
  className?: string
  testId?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<'idle' | 'reading' | 'uploading'>('idle')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [failed, setFailed] = useState<DocFile | null>(null)
  const busy = phase !== 'idle'

  const send = async (file: DocFile) => {
    setPhase('uploading')
    setError('')
    try {
      const ok = await onUpload(file)
      if (ok === false) {
        setFailed(file)
        setError('Upload failed. Check your connection and try again.')
      } else {
        setFailed(null)
      }
    } catch {
      setFailed(file)
      setError('Upload failed. Check your connection and try again.')
    } finally {
      setPhase('idle')
    }
  }

  const pick = async (f: File | null) => {
    if (!f || busy) return
    setError('')
    setFailed(null)
    const typeError = applicationDocTypeError(f)
    if (typeError) return setError(typeError)
    setName(f.name)
    setPhase('reading')
    let read: Awaited<ReturnType<typeof readDocumentFile>>
    try {
      // Photos are made smaller first; the size limit applies to the result.
      read = await readDocumentFile(f, APPLICATION_DOC_MAX_BYTES)
    } catch {
      setPhase('idle')
      return setError('Could not read that file. Try a different PDF or photo.')
    }
    const refusal = applicationDocFileError({ size: read.bytes, type: f.type, name: f.name })
    if (refusal) {
      setPhase('idle')
      return setError(refusal)
    }
    await send({ name: read.name, mimeType: read.mimeType, dataUrl: read.dataUrl })
  }

  const busyText = phase === 'reading' ? `Preparing ${name}…` : `Uploading ${name}…`

  return (
    <div className={cn('min-w-0', variant === 'button' ? 'w-full sm:w-auto' : '', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={APPLICATION_DOC_ACCEPT}
        className="sr-only"
        data-testid={testId}
        disabled={busy}
        onChange={(e) => {
          void pick(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
      {busy ? (
        <div className="min-w-[12rem] max-w-xs" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-xs font-semibold text-primary">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            <span className="truncate">{busyText}</span>
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-primary-100">
            <div className="h-full w-1/3 animate-[docupload_1.1s_ease-in-out_infinite] rounded-full bg-primary motion-reduce:w-full motion-reduce:animate-none" />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={
              variant === 'link'
                ? 'inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline'
                : 'inline-flex min-h-9 items-center gap-2 rounded-full border border-primary-200 bg-white px-4 text-xs font-semibold text-primary hover:bg-primary-50'
            }
          >
            <Upload className={variant === 'link' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
            {label}
          </button>
          {failed ? (
            <button
              type="button"
              onClick={() => void send(failed)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Try again
            </button>
          ) : null}
        </div>
      )}
      {error ? (
        <p className="mt-1 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
