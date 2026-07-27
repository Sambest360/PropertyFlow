import type { AppUser } from '../../types/domain'
import { roleLabels } from '../../lib/permissions'
import { DetailSection, DetailStack, FlatField, FlatFieldGrid } from '../detail/FlatFields'

export function TeamOverviewPanel({
  user,
  agencyName,
  closedDeals,
  openLeads,
  assignedProperties,
}: {
  user: AppUser
  agencyName: string
  closedDeals: number
  openLeads: number
  assignedProperties: number
}) {
  return (
    <DetailStack columns={2}>
      <DetailSection
        title="Overview"
        subtitle="Role and status at a glance. Open Details for contact information."
      >
        <FlatFieldGrid className="lg:grid-cols-2">
          <FlatField label="Person ID" value={user.id} />
          <FlatField label="Role" value={roleLabels[user.role] ?? user.role} />
          <FlatField label="Agency" value={agencyName} />
          <FlatField label="Status" value={user.active ? 'Active' : 'Inactive'} />
        </FlatFieldGrid>
      </DetailSection>

      <DetailSection title="Workload" subtitle="Current book of business.">
        <dl className="grid grid-cols-3 gap-6">
          <div>
            <dt className="text-[11px] font-medium text-ink-400">Closed</dt>
            <dd className="mt-1 tabular font-display text-2xl font-semibold text-ink">
              {closedDeals}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium text-ink-400">Leads</dt>
            <dd className="mt-1 tabular font-display text-2xl font-semibold text-ink">{openLeads}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium text-ink-400">Properties</dt>
            <dd className="mt-1 tabular font-display text-2xl font-semibold text-ink">
              {assignedProperties}
            </dd>
          </div>
        </dl>
      </DetailSection>
    </DetailStack>
  )
}
