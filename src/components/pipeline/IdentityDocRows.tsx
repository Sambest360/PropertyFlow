/**
 * Identity documents (ID, proof of address, FICA declaration) with view and
 * upload, for stages that need them in before approving.
 */
import { CheckCircle2, Circle, Eye } from 'lucide-react'
import type { Application } from '../../types/domain'
import { DocUploadButton } from '../applicant-detail/DocUploadButton'
import { openApplicationDocumentFile } from '../../lib/applicationDocumentFile'

const KEYS = ['id', 'address', 'fica']

export function IdentityDocRows({
  application,
  onUpload,
}: {
  application: Application
  onUpload: (key: string, file: { name: string; mimeType: string; dataUrl: string }) => Promise<boolean> | void
}) {
  const docs = KEYS.map((k) => application.documents.find((d) => d.key === k)).filter(Boolean) as Application['documents']
  if (docs.every((d) => d.status === 'uploaded' || d.status === 'verified')) return null
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-ink-500">Identity documents</p>
      <ul className="divide-y divide-primary-50 rounded-xl border border-primary-100 bg-white">
        {docs.map((d) => {
          const inFile = d.status === 'uploaded' || d.status === 'verified'
          return (
            <li key={d.key} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              {inFile ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> : <Circle className="h-4 w-4 text-ink-300" aria-hidden />}
              <span className="min-w-0 flex-1 text-ink">{d.label}</span>
              {d.file ? (
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" onClick={() => openApplicationDocumentFile(d.file!)}>
                  <Eye className="h-3.5 w-3.5" aria-hidden /> View
                </button>
              ) : null}
              {!inFile ? (
                <DocUploadButton variant="link" onUpload={(file) => onUpload(d.key, file)} testId={`id-upload-${d.key}`} />
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
