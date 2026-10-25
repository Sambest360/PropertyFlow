import { FileText } from 'lucide-react'
import type { Application, ApplicationDocument } from '../../types/domain'
import { Card } from '../ui'
import { ApplicationDocumentRow } from './ApplicationDocumentRow'
import { FicaPackGateStatus } from '../fica/FicaPackGateStatus'
import { FieldHelp } from '../onboarding/FieldHelp'
import { FICA_PACK_MODE_A_COPY } from '../../lib/ficaPack'
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
  ) => Promise<boolean> | void
}) {
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <FileText className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
        Documents
        <FieldHelp title="FICA pack" body={FICA_PACK_MODE_A_COPY} />
      </h2>
      <p className="mt-1 text-sm text-ink-500">
        {isTenant
          ? 'For each document: choose a file (PDF or photo), check it, then press Save document.'
          : 'Full checklist for this application. Upload and review also happen in the Application lifecycle tab.'}
      </p>

      {canReview ? (
        <div className="mt-3">
          <FicaPackGateStatus documents={application.documents} />
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {application.documents.map((d) => (
          <ApplicationDocumentRow
            key={d.key}
            doc={d}
            canUpload={Boolean(isTenant && onUploadDocument)}
            canReview={canReview}
            onUpload={(file) => onUploadDocument?.(d.key, file)}
            onSetStatus={(status, note) => onSetDocument(d.key, status, note)}
          />
        ))}
        {!application.documents.length && (
          <li className="py-8 text-center text-sm text-ink-500">No documents on this application.</li>
        )}
      </ul>
    </Card>
  )
}
