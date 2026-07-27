import { Link } from 'react-router-dom'
import { ArrowRight, MapPin } from 'lucide-react'
import { Badge, Button, cn, statusTone } from '../ui'
import { PersonAvatar } from '../directory/DirectoryToolbar'
import type { PortfolioApplicant } from './types'

const ICON_STROKE = 1.6

export function ApplicantPortfolioCard({
  item,
  reducedMotion,
}: {
  item: PortfolioApplicant
  reducedMotion?: boolean
}) {
  const a = item.application
  const detailTo = `/workspace/sales/applications/${encodeURIComponent(a.id)}`

  return (
    <Link
      to={detailTo}
      className={cn(
        'block cursor-pointer rounded-[1.25rem] border border-primary-100/80 bg-white p-4 text-left shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] transition-shadow duration-200 hover:shadow-[0_14px_28px_-16px_rgba(15,39,68,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        reducedMotion && 'transition-none',
      )}
    >
      <div className="flex items-start gap-3">
        <PersonAvatar name={a.applicantName} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink">{a.applicantName}</h3>
          <p className="truncate text-xs text-ink-500">{item.propertyTitle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(a.stage)}>{a.stage}</Badge>
            <span className="text-xs text-ink-500">{a.type}</span>
          </div>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px] text-ink-400">
              <span>Progress</span>
              <span className="tabular font-medium text-ink">{a.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-primary-50">
              <div className="h-full rounded-full bg-primary" style={{ width: `${a.progress}%` }} />
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1 truncate text-xs text-ink-500">
            <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
            {item.agentName ?? 'Unassigned agent'}
          </p>
          <span className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary">
            Open applicant
            <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  )
}

export function ApplicantExpansion({
  item,
  reducedMotion,
}: {
  item: PortfolioApplicant
  reducedMotion?: boolean
}) {
  const a = item.application
  const detailTo = `/workspace/sales/applications/${encodeURIComponent(a.id)}`

  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Email', value: a.email },
    { label: 'Phone', value: a.phone || '—' },
    { label: 'Property', value: item.propertyTitle },
    { label: 'Type', value: a.type },
    { label: 'Stage', value: a.stage },
    { label: 'Progress', value: `${a.progress}%` },
    { label: 'Agent', value: item.agentName ?? 'Unassigned' },
    { label: 'Updated', value: a.updatedAt },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-3">
          <PersonAvatar name={a.applicantName} />
          <div className="min-w-0">
            <p className="font-display text-2xl font-semibold tracking-tight text-ink">
              {a.applicantName}
            </p>
            <p className="truncate text-sm text-ink-500">{a.id}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge tone={statusTone(a.stage)}>{a.stage}</Badge>
          <span className="text-xs text-ink-500">{a.type}</span>
        </div>
      </div>

      <div className="min-w-0">
        <dl className="grid gap-2 sm:grid-cols-2">
          {metaRows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                {row.label}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-semibold tabular text-ink" title={row.value}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <div
          className={cn(
            'mt-4 flex flex-wrap gap-2 border-t border-primary-100/80 pt-4',
            reducedMotion && 'transition-none',
          )}
        >
          <Link to={detailTo} className="inline-flex">
            <Button className="min-h-11 cursor-pointer gap-2 rounded-2xl">
              Open applicant
              <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            </Button>
          </Link>
          <Link
            to={`/workspace/properties/${encodeURIComponent(a.propertyId)}?tab=applicants`}
            className="inline-flex"
          >
            <Button variant="secondary" className="min-h-11 rounded-2xl">
              <MapPin className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Property
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
