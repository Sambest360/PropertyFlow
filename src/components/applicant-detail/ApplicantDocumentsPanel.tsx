import { Eye, FileText, Paperclip } from 'lucide-react'
import { useAgencyPipeline } from '../../hooks/useApplicationPipeline'
import { openApplicationDocumentFile } from '../../lib/applicationDocumentFile'
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
  const pipeline = useAgencyPipeline(application.agencyId)
  // Files from the stages (staff only, except the tenant's own deposit proof).
  const stageFiles: Array<{ stage: string; file: { name: string; mimeType?: string; dataUrl: string }; at?: string; by?: string }> = []
  if (canReview) {
    for (const st of pipeline.stages) {
      const rec = application.stageRecords?.[st.key]
      for (const a of rec?.attachments ?? []) stageFiles.push({ stage: st.label, file: a, at: rec?.at, by: rec?.byName })
    }
  }
  if (application.depositProof) {
    const p = application.depositProof
    stageFiles.push({
      stage: `Deposit proof of payment${p.status === 'approved' ? ' (approved)' : p.status === 'declined' ? ' (declined)' : ''}`,
      file: { name: p.name, mimeType: p.mimeType, dataUrl: p.dataUrl },
      at: p.uploadedAt,
    })
  }
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

      {stageFiles.length ? (
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-ink">Added during the application</h3>
          <p className="text-xs text-ink-500">Files saved at the application stages, such as the credit check report and the deposit proof of payment.</p>
          <ul className="mt-2 divide-y divide-primary-50 rounded-xl border border-primary-100">
            {stageFiles.map((f, i) => (
              <li key={`${f.stage}-${f.file.name}-${i}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <Paperclip className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{f.file.name}</span>
                  <span className="block text-xs text-ink-500">
                    {f.stage}
                    {f.at ? ` · ${new Date(f.at).toLocaleDateString('en-ZA')}` : ''}
                    {f.by ? ` · ${f.by}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  onClick={() => openApplicationDocumentFile(f.file)}
                >
                  <Eye className="h-4 w-4" aria-hidden /> View
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Card>
  )
}
