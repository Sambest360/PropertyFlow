import { useRef, useState } from 'react'
import { Check, Eye, FileText, Upload, XCircle } from 'lucide-react'
import type { ApplicationDocument } from '../../types/domain'
import { showAuthWarning } from '../../lib/sweetAlert'
import { mediaLocator, toStorageRef } from '../../lib/storage/contract'
import { getFileStorage } from '../../lib/storage'
import { applicationDocumentTarget } from '../../lib/storage/targets'
import { MediaLink } from '../media/MediaImage'
import { Badge, Button, cn, statusTone, Textarea } from '../ui'
import { ICON_STROKE } from './types'

const ACCEPT = 'image/jpeg,image/png,application/pdf,.pdf,.jpg,.jpeg,.png'

export function ApplicationDocumentRow({
  doc,
  canUpload,
  canReview,
  onUpload,
  onSetStatus,
  uploadTarget,
}: {
  doc: ApplicationDocument
  canUpload: boolean
  canReview: boolean
  onUpload: (file: { name: string; mimeType: string; dataUrl: string; fileId?: string }) => void
  onSetStatus: (status: ApplicationDocument['status'], note?: string) => void
  /** Owning agency path. Tenants upload against their application, or their lease. */
  uploadTarget?: { agencyId: string; applicationId: string; leaseId?: string | null }
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const pickFile = async (file: File | null) => {
    if (!file) return
    if (!uploadTarget?.agencyId) {
      await showAuthWarning('This application is not linked to an agency yet, so the file cannot be stored.')
      return
    }
    try {
      const uploaded = await getFileStorage().upload({
        ...applicationDocumentTarget({
          agencyId: uploadTarget.agencyId,
          applicationId: uploadTarget.applicationId,
          leaseId: uploadTarget.leaseId,
          docKey: doc.key,
          docLabel: doc.label,
        }),
        file,
      })
      onUpload({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataUrl: toStorageRef(uploaded.file_id),
        fileId: uploaded.file_id,
      })
    } catch (err) {
      await showAuthWarning(err instanceof Error ? err.message : 'Could not upload that file.')
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
          <>
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
            <Button
              type="button"
              variant="secondary"
              className="min-h-9 cursor-pointer text-xs"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              {doc.status === 'rejected' ? 'Upload replacement' : 'Upload'}
            </Button>
          </>
        ) : null}

        {mediaLocator(doc.file) ? (
          <MediaLink
            href={mediaLocator(doc.file)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-xl px-3 text-xs font-semibold text-primary hover:bg-primary-50"
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
            View file
          </MediaLink>
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
