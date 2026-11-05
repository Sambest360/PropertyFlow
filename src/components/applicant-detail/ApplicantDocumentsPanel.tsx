import { FileText } from 'lucide-react'
import type { Application, ApplicationDocument } from '../../types/domain'
import { Card } from '../ui'
import { ApplicationDocumentRow } from './ApplicationDocumentRow'
import { FicaPackGateStatus } from '../fica/FicaPackGateStatus'
import { FieldHelp } from '../onboarding/FieldHelp'
import { FICA_PACK_MODE_A_COPY } from '../../lib/ficaPack'
import { ICON_STROKE } from './types'
import { IDENTITY_DOC_KEYS } from '../../lib/pipeline/applicationPipeline'

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
  // Identity (FICA) documents are listed once, on their own; the rest are supporting documents.
  const groups = [
    { title: 'Identity', hint: 'Certified ID or passport, proof of residence and the FICA declaration.', docs: application.documents.filter((d) => IDENTITY_DOC_KEYS.has(d.key)) },
    { title: 'Supporting documents', hint: 'Income, bank statements, employment and references.', docs: application.documents.filter((d) => !IDENTITY_DOC_KEYS.has(d.key)) },
  ]
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
          : 'Every document on this application. Approving the Documents or Identity stage marks the uploaded ones as checked.'}
      </p>

      {canReview ? (
        <div className="mt-3">
          <FicaPackGateStatus documents={application.documents} />
        </div>
      ) : null}

      {groups.map((g) =>
        g.docs.length ? (
          <section key={g.title} className="mt-5">
            <h3 className="text-sm font-semibold text-ink">{g.title}</h3>
            <p className="text-xs text-ink-500">{g.hint}</p>
            <ul className="mt-2 space-y-2">
              {g.docs.map((d) => (
                <ApplicationDocumentRow
                  key={d.key}
                  doc={d}
                  canUpload={Boolean(onUploadDocument && (isTenant || canReview))}
                  canReview={canReview}
                  onUpload={(file) => onUploadDocument?.(d.key, file)}
                  onSetStatus={(status, note) => onSetDocument(d.key, status, note)}
                />
              ))}
            </ul>
          </section>
        ) : null,
      )}
      {!application.documents.length && <p className="py-8 text-center text-sm text-ink-500">No documents on this application.</p>}
    </Card>
  )
}
