/** Recent important events from event_log (server/adminDashboard.ts activityFeed). */
import { useMemo, useState } from 'react'
import type { ActivityItem } from '../../../lib/api/adminDashboardApi'
import { roleLabels } from '../../../lib/permissions'
import { cn } from '../../ui'
import { timeAgo } from './DashboardWidgets'

/** A small dot per kind: account / money / listing / risk. Colour is never the only cue (label is always shown). */
function kindOf(type: string): 'account' | 'money' | 'listing' | 'risk' | 'other' {
  if (type.startsWith('user_') || type.startsWith('email_') || type === 'password_reset' || type === 'impersonation') return 'account'
  if (type.startsWith('deposit_') || type.startsWith('payfast') || type === 'lease_signed') return 'money'
  if (type === 'property_event' || type === 'viewing_attendance_marked') return 'listing'
  if (type === 'escalation' || type === 'support_ticket' || type === 'user_delete_failed') return 'risk'
  return 'other'
}
const DOT: Record<ReturnType<typeof kindOf>, string> = {
  account: 'bg-primary',
  money: 'bg-emerald-600',
  listing: 'bg-primary-300',
  risk: 'bg-accent',
  other: 'bg-ink-300',
}

export function ActivityFeed({
  items,
  limit,
  showAgency,
  filterable = false,
}: {
  items: ActivityItem[]
  limit?: number
  showAgency: boolean
  filterable?: boolean
}) {
  const [type, setType] = useState('all')
  const types = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items) m.set(i.type, i.label)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [items])
  const list = (type === 'all' ? items : items.filter((i) => i.type === type)).slice(0, limit ?? items.length)

  return (
    <div>
      {filterable && types.length > 1 ? (
        <div className="mb-3">
          <label className="text-xs text-ink-500">
            <span className="sr-only">Event type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-9 rounded-lg border border-primary-100 bg-white px-2.5 text-base text-ink sm:text-sm"
            >
              <option value="all">All events</option>
              {types.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-400">No activity recorded yet.</p>
      ) : (
        <ol className="divide-y divide-primary-100/70">
          {list.map((e) => (
            <li key={e.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', DOT[kindOf(e.type)])} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-sm text-ink">
                    <span className="font-medium">{e.label}</span>
                    {e.detail ? <span className="text-ink-500"> · {e.detail}</span> : null}
                  </p>
                  <time dateTime={e.at} title={new Date(e.at).toLocaleString('en-ZA')} className="shrink-0 text-xs tabular-nums text-ink-400">
                    {timeAgo(e.at)}
                  </time>
                </div>
                <p className="truncate text-xs text-ink-400">
                  {e.actorName ? (
                    <>
                      by {e.actorName}
                      {e.actorRole ? ` (${roleLabels[e.actorRole]})` : ''}
                    </>
                  ) : (
                    'System'
                  )}
                  {showAgency && e.agencyName ? ` · ${e.agencyName}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
