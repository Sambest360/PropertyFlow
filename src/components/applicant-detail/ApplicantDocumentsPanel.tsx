import { FileText } from 'lucide-react'
import type { Application, ApplicationDocument } from '../../types/domain'
import { Badge, Card, statusTone } from '../ui'
import { ICON_STROKE } from './types'

export function ApplicantDocumentsPanel({
  application,
  canReview,
  isTenant,
  onSetDocument,
}: {
  application: Application
  canReview: boolean
  isTenant: boolean
  onSetDocument: (key: string, next: ApplicationDocument['status']) => void
}) {
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <FileText className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
        Documents
      </h2>
      <p className="mt-1 text-sm text-ink-500">
        Checklist for this application. Reviewers can advance status; tenants can upload required
        items.
      </p>

      <ul className="mt-4 space-y-2">
        {application.documents.map((d) => (
          <li key={d.key}>
            <button
              type="button"
              disabled={!canReview && !isTenant}
              onClick={() => {
                if (isTenant && d.status === 'required') {
                  onSetDocument(d.key, 'uploaded')
                } else if (canReview) {
                  const next =
                    d.status === 'required'
                      ? 'uploaded'
                      : d.status === 'uploaded'
                        ? 'verified'
                        : 'verified'
                  onSetDocument(d.key, next)
                }
              }}
              className="flex w-full min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border border-primary-100 px-4 py-3 text-left transition-colors duration-200 hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
            >
              <span>
                <span className="block font-semibold text-ink">{d.label}</span>
                {d.note && <span className="mt-0.5 block text-xs text-ink-500">{d.note}</span>}
              </span>
              <Badge tone={statusTone(d.status)}>{d.status}</Badge>
            </button>
          </li>
        ))}
        {!application.documents.length && (
          <li className="py-8 text-center text-sm text-ink-500">No documents on this application.</li>
        )}
      </ul>
    </Card>
  )
}
