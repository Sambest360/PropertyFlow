import { useRef, useState } from 'react'
import { Check, Download, Eye, FileText, Loader2, Upload, X, XCircle } from 'lucide-react'
import type { ApplicationDocument } from '../../types/domain'
import {
  APPLICATION_DOC_ACCEPT,
  APPLICATION_DOC_MAX_BYTES,
  applicationDocFileError,
  applicationDocTypeError,
} from '../../lib/applicationDocUpload'
import { readDocumentFile } from '../../lib/applicationDocDownscale'
import {
  downloadApplicationDocumentFile,
  openApplicationDocumentFile,
} from '../../lib/applicationDocumentFile'
import { showAuthWarning } from '../../lib/sweetAlert'
import { Badge, Button, cn, statusTone, Textarea } from '../ui'
import { ICON_STROKE } from './types'

const ACCEPT = APPLICATION_DOC_ACCEPT

export function ApplicationDocumentRow({
  doc,
  canUpload,
  canReview,
  onUpload,
  onSetStatus,
}: {
  doc: ApplicationDocument
  canUpload: boolean
  canReview: boolean
  /** Resolves false when the save failed; the row keeps the file so it can be retried. */
  onUpload: (file: { name: string; mimeType: string; dataUrl: string }) => Promise<boolean> | void
  onSetStatus: (status: ApplicationDocument['status'], note?: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  // Upload is two steps: choose a file (read + checked, "Preparing…"), then
  // Save (sent to the server, "Saving…"). Nothing changes on the document
  // until the save succeeds.
  const [staged, setStaged] = useState<
    { name: string; mimeType: string; dataUrl: string; bytes: number } | null
  >(null)
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'saving'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  const pickFile = async (file: File | null) => {
    if (!file) return
    setSaveError(null)
    const typeError = applicationDocTypeError(file)
    if (typeError) {
      await showAuthWarning(typeError)
      return
    }
    setPhase('preparing')
    try {
      // Images are downscaled first; the cap applies to the result.
      const read = await readDocumentFile(file, APPLICATION_DOC_MAX_BYTES)
      const refusal = applicationDocFileError({ size: read.bytes, type: file.type, name: file.name })
      if (refusal) {
        await showAuthWarning(refusal)
        return
      }
      setStaged({ name: read.name, mimeType: read.mimeType, dataUrl: read.dataUrl, bytes: read.bytes })
    } catch {
      await showAuthWarning('Could not read that file — try a different PDF or image.')
    } finally {
      setPhase('idle')
    }
  }

  const saveStaged = async () => {
    if (!staged || phase !== 'idle') return
    setPhase('saving')
    setSaveError(null)
    try {
      const ok = await onUpload({ name: staged.name, mimeType: staged.mimeType, dataUrl: staged.dataUrl })
      if (ok === false) setSaveError('Could not save this document. Check your connection and try again.')
      else setStaged(null)
    } catch {
      setSaveError('Could not save this document. Check your connection and try again.')
    } finally {
      setPhase('idle')
    }
  }

  const showUpload = canUpload && (doc.status === 'required' || doc.status === 'rejected')
  const showReview = canReview && (doc.status === 'uploaded' || doc.status === 'required')

  return (
    <li className="rounded-xl border border-primary-100 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
            <p className="text-sm font-semibold text-ink">{doc.label}</p>
          </div>
          {doc.rejectedReason ? (
            <p className="mt-1 text-xs text-accent-800">Rejected: {doc.rejectedReason}</p>
          ) : doc.note ? (
            <p className="mt-1 text-xs text-ink-500">{doc.note}</p>
          ) : null}
          {doc.file ? (
            <p className="mt-1 text-xs text-ink-500">
              {doc.file.name} · {new Date(doc.file.uploadedAt).toLocaleDateString()}
            </p>
          ) : null}
        </div>
        <Badge tone={statusTone(doc.status)}>{doc.status}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {showUpload ? (
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              void pickFile(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
        ) : null}
        {showUpload && !staged ? (
          <Button
            type="button"
            variant="secondary"
            className="min-h-9 cursor-pointer text-xs"
            disabled={phase === 'preparing'}
            onClick={() => inputRef.current?.click()}
          >
            {phase === 'preparing' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={ICON_STROKE} aria-hidden />
            ) : (
              <Upload className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
            )}
            {phase === 'preparing'
              ? 'Preparing…'
              : doc.status === 'rejected'
                ? 'Choose replacement file'
                : 'Choose file'}
          </Button>
        ) : null}

        {doc.file?.dataUrl ? (
          <>
            <Button
              type="button"
              variant="ghost"
              className="min-h-9 cursor-pointer text-xs"
              onClick={() => {
                const file = doc.file!
                if (!openApplicationDocumentFile({ name: file.name, mimeType: file.mimeType, dataUrl: file.dataUrl })) {
                  void showAuthWarning('Could not open this file — try Download instead.')
                }
              }}
            >
              <Eye className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              View file
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-9 cursor-pointer text-xs"
              onClick={() => {
                const file = doc.file!
                if (
                  !downloadApplicationDocumentFile({
                    name: file.name,
                    mimeType: file.mimeType,
                    dataUrl: file.dataUrl,
                  })
                ) {
                  void showAuthWarning('Could not download this file — try uploading again.')
                }
              }}
            >
              <Download className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              Download
            </Button>
          </>
        ) : null}

        {showReview ? (
          <>
            <Button
              type="button"
              variant="secondary"
              className={cn('min-h-9 cursor-pointer text-xs', doc.status === 'verified' && 'hidden')}
              onClick={() => onSetStatus('verified')}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              Approve
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-9 cursor-pointer text-xs text-accent"
              onClick={() => setRejectOpen((o) => !o)}
            >
              <XCircle className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              Reject
            </Button>
          </>
        ) : null}
      </div>

      {staged ? (
        <div
          className="mt-3 rounded-xl border border-primary-200 bg-primary-50/60 p-3"
          aria-busy={phase === 'saving'}
        >
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 shrink-0 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium text-ink">{staged.name}</span>
            <span className="tabular shrink-0 text-xs text-ink-500">
              {staged.bytes >= 1024 * 1024
                ? `${(staged.bytes / (1024 * 1024)).toFixed(1)} MB`
                : `${Math.max(1, Math.round(staged.bytes / 1024))} KB`}
            </span>
          </div>
          {saveError ? <p className="mt-2 text-xs text-accent-700">{saveError}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-9 cursor-pointer text-xs"
              disabled={phase === 'saving'}
              onClick={() => void saveStaged()}
            >
              {phase === 'saving' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={ICON_STROKE} aria-hidden />
              ) : (
                <Check className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              )}
              {phase === 'saving' ? 'Saving…' : saveError ? 'Try again' : 'Save document'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-9 cursor-pointer text-xs"
              disabled={phase === 'saving'}
              onClick={() => inputRef.current?.click()}
            >
              Choose another
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-9 cursor-pointer text-xs"
              disabled={phase === 'saving'}
              onClick={() => {
                setStaged(null)
                setSaveError(null)
              }}
            >
              <X className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {rejectOpen ? (
        <div className="mt-3 space-y-2 rounded-xl border border-accent-200 bg-accent-50/50 p-3">
          <label className="block text-xs font-medium text-ink">
            Rejection reason
            <Textarea
              className="mt-1 min-h-16 text-sm"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Document older than 3 months"
            />
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="danger"
              className="min-h-9 cursor-pointer text-xs"
              disabled={rejectReason.trim().length < 4}
              onClick={() => {
                onSetStatus('rejected', rejectReason.trim())
                setRejectOpen(false)
                setRejectReason('')
              }}
            >
              Confirm rejection
            </Button>
            <Button type="button" variant="ghost" className="min-h-9 text-xs" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
