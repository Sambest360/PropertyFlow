import { ArrowRight, Download } from 'lucide-react'
import { dedupePropertyEvents } from '../../lib/history/dedupeEvents'
import type { PropertyEvent } from '../../types/domain'
import { Badge, Button, Card } from '../ui'
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

/** P1-7: exportable audit history — "prove this let" for demos and audits. */
function exportHistoryCsv(events: PropertyEvent[], propertyTitle: string): void {
  const sorted = dedupePropertyEvents(events)
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const rows: string[] = [
    ['timestamp', 'actor', 'action', 'field', 'from', 'to'].join(','),
  ]
  for (const ev of sorted) {
    const base = [ev.at, ev.actorName, ev.action]
    if (ev.changes?.length) {
      for (const c of ev.changes) {
        rows.push([...base, c.field, c.from, c.to].map((v) => esc(String(v ?? ''))).join(','))
      }
    } else {
      rows.push([...base, '', '', ''].map((v) => esc(String(v ?? ''))).join(','))
    }
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `history-${propertyTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function PropertyHistoryTimeline({
  events,
  propertyTitle,
}: {
  events: PropertyEvent[]
  propertyTitle?: string
}) {
  const sorted = dedupePropertyEvents(events).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-ink">History</h2>
        {sorted.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => exportHistoryCsv(sorted, propertyTitle ?? 'property')}
          >
            <Download className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Export CSV
          </Button>
        )}
      </div>
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
