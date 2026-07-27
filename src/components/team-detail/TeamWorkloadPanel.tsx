import { Link } from 'react-router-dom'
import { ChevronRight, MapPin } from 'lucide-react'
import type { Lead, PropertyAsset } from '../../types/domain'
import { Badge, Card, cn, statusTone } from '../ui'
import { formatZAR } from '../../data/seed'
import { ICON_STROKE } from './types'

export function TeamWorkloadPanel({
  openLeads,
  properties,
}: {
  openLeads: Array<{ lead: Lead; propertyTitle: string }>
  properties: PropertyAsset[]
}) {
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Open leads</h2>
        <p className="mt-1 text-sm text-ink-500">Enquiries currently assigned to this person.</p>
        {!openLeads.length ? (
          <p className="mt-4 py-6 text-center text-sm text-ink-500">No open leads assigned.</p>
        ) : (
          <ul className="mt-4 divide-y divide-primary-50 overflow-hidden rounded-xl border border-primary-100">
            {openLeads.map(({ lead, propertyTitle }) => (
              <li key={lead.id}>
                <Link
                  to={`/workspace/sales/crm/${encodeURIComponent(lead.id)}`}
                  className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-ink">{lead.name}</span>
                      <Badge tone={statusTone(lead.stage)}>{lead.stage}</Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-500">
                      {propertyTitle} · {lead.channel}
                    </span>
                  </span>
                  <span className="shrink-0 tabular text-sm font-semibold text-ink">
                    {formatZAR(lead.value)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-ink-300" strokeWidth={ICON_STROKE} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Assigned properties</h2>
        <p className="mt-1 text-sm text-ink-500">Listings this agent is responsible for.</p>
        {!properties.length ? (
          <p className="mt-4 py-6 text-center text-sm text-ink-500">No properties assigned.</p>
        ) : (
          <ul className="mt-4 divide-y divide-primary-50 overflow-hidden rounded-xl border border-primary-100">
            {properties.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/workspace/properties/${encodeURIComponent(p.id)}`}
                  className={cn(
                    'flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  )}
                >
                  <MapPin className="h-4 w-4 shrink-0 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{p.title}</span>
                    <span className="text-xs text-ink-500">
                      {p.suburb}, {p.city} · {p.status}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-ink-300" strokeWidth={ICON_STROKE} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
