import { Mail } from 'lucide-react'
import type { Tenancy } from '../../types/domain'
import { hideBackendUuid } from '../../lib/displayIds'
import { DetailSection, AgentAssigneeField, FlatField, FlatFieldGrid } from '../detail/FlatFields'

export function TenantDetailsPanel({
  tenancy,
  agentName,
  landlordName,
}: {
  tenancy: Tenancy
  agentName: string | null
  landlordName: string | null
}) {
  return (
    <DetailSection title="Personal details" subtitle="Tenant contact and parties on this lease.">
      <FlatFieldGrid>
        <FlatField label="Full name" value={tenancy.tenantName} />
        <FlatField icon={Mail} label="Email" value={tenancy.tenantEmail} />
        <FlatField label="Tenant user ID" value={hideBackendUuid(tenancy.tenantUserId)} />
        <AgentAssigneeField agentId={tenancy.agentId} agentName={agentName} />
        <FlatField label="Landlord" value={landlordName ?? '—'} />
        <FlatField label="Application" value={hideBackendUuid(tenancy.applicationId)} />
      </FlatFieldGrid>
    </DetailSection>
  )
}
