import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import type { Application, PropertyAsset } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { DetailSection, DetailStack, FlatField, FlatFieldGrid } from '../detail/FlatFields'
import { ICON_STROKE } from './types'

/** Lean at-a-glance view — flat text; linked property is a simple link. */
export function ApplicantOverviewPanel({
  application,
  property,
  agentName,
}: {
  application: Application
  property: PropertyAsset | null
  agentName: string | null
}) {
  return (
    <DetailStack columns={2}>
      <DetailSection
        title="Overview"
        subtitle="Where this application sits right now. Open Details for personal information."
      >
        <FlatFieldGrid className="lg:grid-cols-2">
          <FlatField label="Application" value={application.id} />
          <FlatField label="Type" value={application.type} />
          <FlatField label="Stage" value={application.stage} />
          <FlatField label="Progress" value={`${application.progress}%`} tabular />
          <FlatField label="Agent" value={agentName ?? 'Unassigned'} />
          <FlatField label="Submitted" value={application.submittedAt} />
          <FlatField label="Updated" value={application.updatedAt} />
        </FlatFieldGrid>
      </DetailSection>

      <DetailSection title="Linked property" subtitle="The home this applicant is applying for.">
        {property ? (
          <Link
            to={`/workspace/properties/${property.id}?tab=applicants`}
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
                {property.rent ? ` · ${formatZAR(property.rent)}/mo` : ''}
              </span>
              <span className="mt-0.5 block text-xs text-ink-400">{property.address}</span>
            </span>
          </Link>
        ) : (
          <p className="text-sm text-ink-500">Property record not found.</p>
        )}
        {application.keyCollection && (
          <div className="border-t border-primary-50 pt-4">
            <p className="text-[11px] font-medium text-ink-400">Key collection</p>
            <p className="mt-1 text-sm font-semibold text-ink">{application.keyCollection.location}</p>
            <p className="mt-0.5 text-sm text-ink-500">{application.keyCollection.instructions}</p>
          </div>
        )}
      </DetailSection>
    </DetailStack>
  )
}
