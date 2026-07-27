import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import type { PropertyAsset, Tenancy } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { DetailSection, DetailStack, FlatField, FlatFieldGrid } from '../detail/FlatFields'
import { ICON_STROKE } from './types'

export function TenantOverviewPanel({
  tenancy,
  property,
  agentName,
}: {
  tenancy: Tenancy
  property: PropertyAsset | null
  agentName: string | null
}) {
  return (
    <DetailStack columns={2}>
      <DetailSection
        title="Overview"
        subtitle="Current lease position. Open Details for contact information."
      >
        <FlatFieldGrid className="lg:grid-cols-2">
          <FlatField label="Tenancy ID" value={tenancy.id} />
          <FlatField label="Status" value={tenancy.status} />
          <FlatField label="Rent" value={`${formatZAR(tenancy.rent)}/mo`} tabular />
          <FlatField label="Deposit" value={formatZAR(tenancy.deposit)} tabular />
          <FlatField label="Start" value={tenancy.startDate} />
          <FlatField label="End" value={tenancy.endDate ?? 'Open-ended'} />
          <FlatField label="Agent" value={agentName ?? 'Unassigned'} />
        </FlatFieldGrid>
      </DetailSection>

      <DetailSection title="Linked property" subtitle="The home under this lease.">
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
              </span>
              <span className="mt-0.5 block text-xs text-ink-400">{property.address}</span>
            </span>
          </Link>
        ) : (
          <p className="text-sm text-ink-500">Property record not found.</p>
        )}
      </DetailSection>
    </DetailStack>
  )
}
