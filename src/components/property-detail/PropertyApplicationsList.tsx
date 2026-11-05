/**
 * Property → Applications: read-only. Shows each applicant and the stage their
 * application is at; all actions happen on the application page itself.
 */
import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import type { Application } from '../../types/domain'
import { Badge, Card, statusTone } from '../ui'
import { relativeAge } from '../../lib/relativeTime'

export function PropertyApplicationsList({ applications }: { applications: Application[] }) {
  const sorted = [...applications].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  if (!sorted.length) {
    return <Card className="p-6 text-sm text-ink-500">No applications for this property yet.</Card>
  }
  return (
    <Card className="overflow-hidden p-0">
      <ul className="divide-y divide-primary-50">
        {sorted.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{a.applicantName}</p>
              <p className="text-xs text-ink-500">
                {a.type} · applied {relativeAge(a.submittedAt)} · updated {relativeAge(a.updatedAt)}
              </p>
            </div>
            <Badge tone={statusTone(a.stage)}>{a.stage}</Badge>
            <Link
              to={`/workspace/sales/applications/${encodeURIComponent(a.id)}`}
              className="inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              View application
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
