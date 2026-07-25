import { Link } from 'react-router-dom'
import {
  Camera,
  HardHat,
  MapPin,
  Replace,
  Wrench,
} from 'lucide-react'
import type { AppUser, MaintenanceTicket } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { Button, Card, Select, cn } from '../ui'
import { formatAge, isOpenStatus, type PortfolioTicket } from '../maintenance/types'

const ICON_STROKE = 1.6

const MANAGE_STATUSES: MaintenanceTicket['status'][] = [
  'Requested',
  'In Progress',
  'Awaiting Parts',
  'Cancelled',
]

export function MaintenanceOverviewPanel({
  item,
  canManage,
  contractors,
  onUpdateStatus,
  onAssignContractor,
  onRequestComplete,
}: {
  item: PortfolioTicket
  canManage: boolean
  contractors: AppUser[]
  onUpdateStatus: (id: string, status: MaintenanceTicket['status']) => void
  onAssignContractor: (id: string, contractorId: string | null) => void
  onRequestComplete: (id: string) => void
}) {
  const t = item.ticket
  const health = item.assetHealth
  const propertyHref = `/workspace/properties/${item.property.id}?tab=maintenance`

  const rows: Array<{ label: string; value: string; tabular?: boolean }> = [
    { label: 'Opened', value: t.openedAt, tabular: true },
    { label: 'Reported by', value: t.reportedBy },
    { label: 'Assigned agent', value: item.agentName ?? '—' },
    { label: 'Category', value: t.categoryKey ?? 'GENERAL' },
    { label: 'Asset', value: t.assetLabel },
    {
      label: 'Photos / cost',
      value: `${t.photos} · ${t.cost ? formatZAR(t.cost) : 'Quote pending'}`,
      tabular: true,
    },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <Card className="space-y-5 p-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Issue</p>
          <p className="mt-2 text-sm leading-relaxed text-ink">{t.description}</p>
        </div>

        {t.resolutionNotes && (
          <div className="border-t border-primary-50 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              Work performed
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink">{t.resolutionNotes}</p>
          </div>
        )}

        <dl className="divide-y divide-primary-50 border-y border-primary-50">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 py-3">
              <dt className="shrink-0 text-sm text-ink-500">{row.label}</dt>
              <dd
                className={cn(
                  'min-w-0 text-right text-sm font-medium text-ink',
                  row.tabular && 'tabular',
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <Link
          to={propertyHref}
          className="inline-flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-primary-100 bg-primary-50/50 px-3 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MapPin className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">
            {item.property.title}
            <span className="mt-0.5 block text-xs font-medium text-ink-500">
              {item.property.suburb}, {item.property.city}
            </span>
          </span>
        </Link>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            {health.disposition === 'REPLACE' ? (
              <Replace className="h-4 w-4 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
            ) : (
              <Wrench className="h-4 w-4 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
            )}
            {health.disposition_label}
          </p>
          <p className="mt-1 text-xs tabular text-ink-500">
            Health {health.health_score}/100
            {health.condition ? ` · ${health.condition}` : ''}
            {health.purchase_value != null ? ` · asset ${formatZAR(health.purchase_value)}` : ''}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            {health.item_name}
            {health.brand ? ` · ${health.brand}` : ''}
            {health.warranty_covered ? ' · under warranty' : ''}
          </p>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1">
              <HardHat className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              {item.contractorName ?? 'No contractor'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Camera className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              <span className="tabular">{t.photos}</span> photos
            </span>
            <span className="tabular">{formatAge(item.ageHours)} open</span>
          </div>
        </Card>

        {canManage && isOpenStatus(t.status) && (
          <Card className="space-y-3 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              Manage maintenance
            </p>
            <div className="flex flex-col gap-2">
              <Select
                className="min-h-11 w-full"
                value={t.status}
                onChange={(e) => onUpdateStatus(t.id, e.target.value as MaintenanceTicket['status'])}
                aria-label="Maintenance status"
              >
                {MANAGE_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <Select
                className="min-h-11 w-full"
                value={t.contractorId ?? ''}
                onChange={(e) => onAssignContractor(t.id, e.target.value || null)}
                aria-label="Assign contractor"
              >
                <option value="">Assign contractor…</option>
                {contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-xs text-ink-500">
              To mark Resolved, complete the work form — cost, notes, contractor, and photos are
              required.
            </p>
            <Button className="min-h-11 w-full" onClick={() => onRequestComplete(t.id)}>
              Complete work…
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}
