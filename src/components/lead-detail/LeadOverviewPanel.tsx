import { Link } from 'react-router-dom'
import { ArrowRight, MapPin } from 'lucide-react'
import type { Lead, PropertyAsset, Viewing } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { hideBackendUuid } from '../../lib/displayIds'
import { buildLeadStageContext, findLeadViewings } from '../../lib/leadContext'
import { leadViewingDeskHref } from '../../lib/leadViewing'
import { DetailSection, DetailStack, AgentAssigneeField, FlatField, FlatFieldGrid } from '../detail/FlatFields'
import { Badge, Button } from '../ui'
import { LeadStageContextPanel } from './LeadStageContextPanel'
import { ICON_STROKE } from './types'
import { TenantConsentBadge } from '../viewings/TenantConsentBadge'

export function LeadOverviewPanel({
  lead,
  property,
  agentName,
  agentId,
  viewings,
  applications,
  canSchedule,
  onScheduleViewing,
}: {
  lead: Lead
  property: PropertyAsset | null
  agentName: string | null
  agentId?: string | null
  viewings: Viewing[]
  applications?: import('../../types/domain').Application[]
  canSchedule?: boolean
  onScheduleViewing?: () => void
}) {
  const matched = findLeadViewings(lead, viewings)
  const stageContext = buildLeadStageContext(lead, {
    property,
    applications: applications ?? [],
    viewings,
    payments: [],
  })

  const needsViewing = !matched.some((v) => v.status === 'Scheduled')

  return (
    <div className="space-y-6">
      <DetailStack columns={2}>
        <DetailSection
          title="Overview"
          subtitle="Where this enquiry sits right now. Open Details for contact and notes."
        >
          <FlatFieldGrid className="lg:grid-cols-2">
            <FlatField label="Lead ID" value={hideBackendUuid(lead.id)} />
            <FlatField label="Type" value={lead.type} />
            <FlatField label="Stage" value={lead.stage} />
            <FlatField label="Channel" value={lead.channel} />
            <FlatField label="Value" value={formatZAR(lead.value)} tabular />
            <AgentAssigneeField agentId={agentId ?? lead.agentId} agentName={agentName} />
            <FlatField label="Created" value={lead.createdAt} />
            <FlatField label="Updated" value={lead.updatedAt} />
          </FlatFieldGrid>
        </DetailSection>

        <DetailSection title="Linked property" subtitle="The listing this lead is interested in.">
          {property ? (
            <Link
              to={`/workspace/properties/${property.id}`}
              className="group inline-flex min-h-11 max-w-full cursor-pointer items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <MapPin
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                strokeWidth={ICON_STROKE}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block font-semibold text-primary group-hover:underline">
                  {property.title}
                </span>
                <span className="mt-0.5 block text-sm text-ink-500">
                  {property.suburb}, {property.city}
                  {property.rent
                    ? ` · ${formatZAR(property.rent)}/mo`
                    : property.price
                      ? ` · ${formatZAR(property.price)}`
                      : ''}
                </span>
              </span>
            </Link>
          ) : (
            <p className="text-sm text-ink-500">Property record not found.</p>
          )}
        </DetailSection>
      </DetailStack>

      <DetailSection
        title="Viewings"
        subtitle="Bookings matched to this contact on the linked listing."
      >
        {matched.length === 0 ? (
          <p className="text-sm text-ink-500">No viewing bookings matched yet.</p>
        ) : (
          <ul className="space-y-2">
            {matched.map((v) => (
              <li key={v.id}>
                <Link
                  to={leadViewingDeskHref(v)}
                  className="group flex min-h-11 items-center justify-between gap-3 rounded-xl border border-primary-100 px-4 py-2 transition-colors hover:border-primary-200 hover:bg-primary-50/40"
                >
                  <span className="text-sm font-semibold text-ink group-hover:text-primary">
                    {v.date} · {v.time}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone="neutral">{v.status}</Badge>
                    <TenantConsentBadge viewing={v} />
                    <ArrowRight className="h-4 w-4 text-ink-300 group-hover:text-primary" strokeWidth={ICON_STROKE} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {canSchedule && onScheduleViewing && needsViewing ? (
          <Button type="button" className="mt-3 min-h-11 gap-2" onClick={onScheduleViewing}>
            Schedule viewing
            <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          </Button>
        ) : null}
      </DetailSection>

      <LeadStageContextPanel context={stageContext} />
    </div>
  )
}
