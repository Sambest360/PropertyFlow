import { FileText } from 'lucide-react'
import type { Application, ApplicationDocument } from '../../types/domain'
import { useStore } from '../../context/AppStore'
import { Card } from '../ui'
import { ApplicationDocumentRow } from './ApplicationDocumentRow'
import { ICON_STROKE } from './types'

export function ApplicantDocumentsPanel({
  application,
  canReview,
  isTenant,
  onSetDocument,
  onUploadDocument,
}: {
  application: Application
  canReview: boolean
  isTenant: boolean
  onSetDocument: (key: string, next: ApplicationDocument['status'], note?: string) => void
  onUploadDocument?: (
    key: string,
    file: { name: string; mimeType: string; dataUrl: string },
  ) => void
}) {
  const { state } = useStore()
  const leaseId = state.tenancies.find((t) => t.applicationId === application.id)?.id ?? null
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <FileText className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
        Documents
      </h2>
      <p className="mt-1 text-sm text-ink-500">
        Full checklist for this application. Upload and review also happen in the Application lifecycle tab.
      </p>

      <ul className="mt-4 space-y-2">
        {application.documents.map((d) => (
          <ApplicationDocumentRow
            key={d.key}
            doc={d}
            canUpload={Boolean(isTenant && onUploadDocument)}
            canReview={canReview}
            onUpload={(file) => onUploadDocument?.(d.key, file)}
            onSetStatus={(status, note) => onSetDocument(d.key, status, note)}
            uploadTarget={{
              agencyId: application.agencyId,
              applicationId: application.id,
              leaseId,
            }}
          />
        ))}
        {!application.documents.length && (
          <li className="py-8 text-center text-sm text-ink-500">No documents on this application.</li>
        )}
      </ul>
    </Card>
  )
}
