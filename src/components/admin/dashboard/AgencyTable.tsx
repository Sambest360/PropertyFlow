/** Super admin: every agency with its counts, sortable, linking to the agency page. */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Search } from 'lucide-react'
import type { AgencyRow } from '../../../lib/api/adminDashboardApi'
import { Badge, cn } from '../../ui'
import { fmtInt, fmtZar, fmtZarShort, timeAgo } from './DashboardWidgets'

type SortKey = 'name' | 'users' | 'units' | 'listings' | 'occupancyRate' | 'openApplications' | 'overdueAmount' | 'openTickets' | 'lastActivityAt'

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean; compact?: boolean }> = [
  { key: 'name', label: 'Agency', compact: true },
  { key: 'users', label: 'Users', numeric: true },
  { key: 'units', label: 'Units', numeric: true, compact: true },
  { key: 'listings', label: 'Listed', numeric: true },
  { key: 'occupancyRate', label: 'Occupancy', numeric: true, compact: true },
  { key: 'openApplications', label: 'Open apps', numeric: true },
  { key: 'overdueAmount', label: 'Overdue', numeric: true, compact: true },
  { key: 'openTickets', label: 'Tickets', numeric: true, compact: true },
  { key: 'lastActivityAt', label: 'Last activity', numeric: true, compact: true },
]

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  trial: 'neutral',
  suspended: 'warning',
  cancelled: 'danger',
}

function sortValue(r: AgencyRow, key: SortKey): number | string {
  if (key === 'name') return r.name.toLowerCase()
  if (key === 'lastActivityAt') return r.lastActivityAt ? new Date(r.lastActivityAt).getTime() : 0
  if (key === 'occupancyRate') return r.occupancyRate ?? -1
  return r[key]
}

export function AgencyTable({ rows, compact = false }: { rows: AgencyRow[]; compact?: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: compact ? 'overdueAmount' : 'name', dir: compact ? -1 : 1 })
  const [q, setQ] = useState('')
  const sorted = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = needle ? rows.filter((r) => r.name.toLowerCase().includes(needle)) : rows
    return [...list].sort((a, b) => {
      const x = sortValue(a, sort.key)
      const y = sortValue(b, sort.key)
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
    })
  }, [rows, sort, q])
  const shown = compact ? sorted.slice(0, 6) : sorted
  const columns = compact ? COLUMNS.filter((c) => c.compact) : COLUMNS
  const show = (key: SortKey) => columns.some((c) => c.key === key)

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' ? 1 : -1 }))

  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-ink-400">No agencies yet.</p>
  }

  return (
    <div>
      {!compact ? (
        <div className="mb-3 flex items-center gap-2">
          <label className="relative block w-full max-w-xs">
            <span className="sr-only">Filter agencies</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter agencies"
              className="h-9 w-full rounded-lg border border-primary-100 bg-white pl-8 pr-3 text-base text-ink placeholder:text-ink-400 focus:border-primary sm:text-sm"
            />
          </label>
          <span className="text-xs tabular-nums text-ink-400">
            {fmtInt(shown.length)} of {fmtInt(rows.length)}
          </span>
        </div>
      ) : null}
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className={cn('w-full text-sm', compact ? 'min-w-[520px]' : 'min-w-[760px]')}>
          <thead>
            <tr className="border-b border-primary-100 text-left text-xs text-ink-500">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn('px-3 py-2 font-medium first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5', c.numeric && 'text-right')}>
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    className={cn('inline-flex items-center gap-1 rounded hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', sort.key === c.key && 'text-ink')}
                    aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                  >
                    {c.label}
                    {sort.key === c.key ? (
                      sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.clientId} className="border-b border-primary-100/60 last:border-0 hover:bg-primary-50/40">
                <td className="max-w-[16rem] px-3 py-2.5 pl-4 sm:pl-5">
                  <div className="flex items-center gap-2">
                    <Link to={`/workspace/admin/agencies/${encodeURIComponent(r.agencyId)}`} className="truncate font-medium text-ink hover:text-primary hover:underline">
                      {r.name || 'Unnamed agency'}
                    </Link>
                    {r.status !== 'active' ? (
                      <Badge tone={STATUS_TONE[r.status] ?? 'neutral'} className="capitalize">
                        {r.status}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-ink-400 tabular-nums">{fmtInt(r.staff)} staff · {fmtInt(r.buildings)} buildings</p>
                </td>
                {show('users') ? <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtInt(r.users)}</td> : null}
                <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtInt(r.units)}</td>
                {show('listings') ? <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtInt(r.listings)}</td> : null}
                <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                  {r.occupancyRate == null ? <span className="text-ink-300">—</span> : `${r.occupancyRate}%`}
                </td>
                {show('openApplications') ? <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtInt(r.openApplications)}</td> : null}
                <td className="px-3 py-2.5 text-right tabular-nums" title={r.overdueCount ? `${r.overdueCount} payments, ${fmtZar(r.overdueAmount)}` : undefined}>
                  {r.overdueCount ? (
                    <span className="text-accent-700">
                      {fmtZarShort(r.overdueAmount)} <span className="text-xs text-ink-400">({fmtInt(r.overdueCount)})</span>
                    </span>
                  ) : (
                    <span className="text-ink-300">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink">{fmtInt(r.openTickets)}</td>
                <td className="px-3 py-2.5 pr-4 text-right text-xs text-ink-500 sm:pr-5" title={r.lastActivityAt ?? undefined}>
                  {timeAgo(r.lastActivityAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
