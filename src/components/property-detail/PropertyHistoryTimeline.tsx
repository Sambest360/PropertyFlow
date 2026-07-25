import { ArrowRight } from 'lucide-react'
import type { PropertyEvent } from '../../types/domain'
import { Badge, Card } from '../ui'
import { ICON_STROKE } from './types'

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-ZA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function PropertyHistoryTimeline({ events }: { events: PropertyEvent[] }) {
  const sorted = [...events].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-5 font-semibold text-ink">History</h2>
      {!sorted.length ? (
        <p className="py-8 text-center text-sm text-ink-500">No history recorded yet.</p>
      ) : (
        <ol className="space-y-6">
          {sorted.map((ev) => (
            <li key={ev.id} className="flex gap-3">
              <span
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white"
                aria-hidden
              >
                {initials(ev.actorName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  <span className="font-semibold">{ev.actorName}</span>{' '}
                  <span className="text-ink-600">{ev.action}</span>
                </p>
                <p className="mt-0.5 text-xs tabular text-ink-400">{formatWhen(ev.at)}</p>
                <Badge className="mt-2" tone="neutral">
                  HISTORY
                </Badge>
                {ev.changes && ev.changes.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-l-2 border-primary-100 pl-3">
                    {ev.changes.map((c, i) => (
                      <li key={`${ev.id}-${c.field}-${i}`} className="text-sm text-ink-600">
                        <span className="text-xs font-medium text-ink-400">{c.field}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-primary-50 px-1.5 py-0.5 text-ink-500">
                            {c.from}
                          </span>
                          <ArrowRight
                            className="h-3.5 w-3.5 shrink-0 text-ink-300"
                            strokeWidth={ICON_STROKE}
                            aria-hidden
                          />
                          <span className="rounded-md bg-primary-50 px-1.5 py-0.5 font-medium text-ink">
                            {c.to}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
