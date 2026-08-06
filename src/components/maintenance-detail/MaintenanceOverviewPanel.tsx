import { Link } from 'react-router-dom'
import {
  Calendar,
  Camera,
  HardHat,
  KeyRound,
  MapPin,
  Pencil,
  Replace,
  Tag,
  Wrench,
} from 'lucide-react'
import type { MaintenanceTicket } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { Button, Card, Select, cn } from '../ui'
import { formatAge, isOpenStatus, type PortfolioTicket } from '../maintenance/types'
import { agentMetaRow } from '../../lib/agentDisplay'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'
import { ContractorPicker } from '../contractors/ContractorPicker'
import { TicketPhotoGallery } from '../maintenance/TicketPhotoGallery'

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
  canAssignContractor,
  agencyId,
  onUpdateStatus,
  onAssignContractor,
  onRequestComplete,
  onEdit,
}: {
  item: PortfolioTicket
  canManage: boolean
  canAssignContractor: boolean
  agencyId: string | null
  onUpdateStatus: (id: string, status: MaintenanceTicket['status']) => void
  onAssignContractor: (id: string, contractorId: string | null) => boolean
  onRequestComplete: (id: string) => void
  onEdit?: () => void
}) {
  const t = item.ticket
  const health = item.assetHealth
  const propertyHref = `/workspace/properties/${item.property.id}?tab=maintenance`
  const { viewerId } = useAgentDisplay()
  const agentRow = agentMetaRow(viewerId, t.assignedAgentId, item.agentName, 'Assigned agent', '—')
  const issuePhotos = t.photoUrls ?? []
  const showOps = (canManage || canAssignContractor) && isOpenStatus(t.status)

  const rows: Array<{ label: string; value: string; tabular?: boolean }> = [
    { label: 'Opened', value: t.openedAt, tabular: true },
    { label: 'Reported by', value: t.reportedBy },
    ...(agentRow ? [agentRow] : []),
    { label: 'Category', value: t.categoryKey ?? 'GENERAL' },
    { label: 'Asset', value: t.assetLabel },
    ...(t.locationDetail ? [{ label: 'Location', value: t.locationDetail }] : []),
    ...(t.preferredSchedule ? [{ label: 'Preferred time', value: t.preferredSchedule }] : []),
    {
      label: 'Cost',
      value: t.cost ? formatZAR(t.cost) : t.estimatedCost ? `Est. ${formatZAR(t.estimatedCost)}` : 'Quote pending',
      tabular: true,
    },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <Card className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Issue</p>
            <p className="mt-2 text-sm leading-relaxed text-ink">{t.description}</p>
          </div>
          {onEdit && showOps ? (
            <Button variant="secondary" size="sm" className="min-h-10 shrink-0" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              Edit
            </Button>
          ) : null}
        </div>

        {t.accessNotes ? (
          <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              <KeyRound className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              Access
            </p>
            <p className="mt-1.5 text-sm text-ink">{t.accessNotes}</p>
          </div>
        ) : null}

        {t.issueTags && t.issueTags.length > 0 ? (
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              <Tag className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              Tags
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {t.issueTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium capitalize text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            <Camera className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
            Issue photos
          </p>
          <TicketPhotoGallery urls={issuePhotos} className="mt-2" />
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
              <span className="tabular">{issuePhotos.length || t.photos}</span> photos
            </span>
            {t.preferredSchedule ? (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                {t.preferredSchedule}
              </span>
            ) : null}
            <span className="tabular">{formatAge(item.ageHours)} open</span>
          </div>
        </Card>

        {showOps && (
          <Card className="space-y-3 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {canManage ? 'Manage maintenance' : 'Book contractor'}
            </p>
            {canManage ? (
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
            ) : null}
            {canAssignContractor ? (
              <>
                <ContractorPicker
                  agencyId={agencyId}
                  categoryKey={t.categoryKey}
                  value={t.contractorId ?? ''}
                  onChange={(id) => onAssignContractor(t.id, id || null)}
                  placeholder="Book approved contractor…"
                />
                <Link
                  to="/workspace/operations/contractors"
                  className="block text-xs font-medium text-primary hover:underline"
                >
                  Browse contractor roster →
                </Link>
              </>
            ) : null}
            {canManage ? (
              <>
                <p className="text-xs text-ink-500">
                  To mark Resolved, complete the work form — cost, notes, contractor, and photos are
                  required.
                </p>
                <Button className="min-h-11 w-full" onClick={() => onRequestComplete(t.id)}>
                  Complete work…
                </Button>
              </>
            ) : null}
          </Card>
        )}
      </div>
    </div>
  )
}
