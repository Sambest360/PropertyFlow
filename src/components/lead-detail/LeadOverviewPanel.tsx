import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import type { Lead, PropertyAsset } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { DetailSection, DetailStack, AgentAssigneeField, FlatField, FlatFieldGrid } from '../detail/FlatFields'
import { ICON_STROKE } from './types'

export function LeadOverviewPanel({
  lead,
  property,
  agentName,
  agentId,
}: {
  lead: Lead
  property: PropertyAsset | null
  agentName: string | null
  agentId?: string | null
}) {
  return (
    <DetailStack columns={2}>
      <DetailSection
        title="Overview"
        subtitle="Where this enquiry sits right now. Open Details for contact and notes."
      >
        <FlatFieldGrid className="lg:grid-cols-2">
          <FlatField label="Lead ID" value={lead.id} />
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
  )
}
