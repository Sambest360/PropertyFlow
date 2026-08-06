import { Mail, Phone } from 'lucide-react'
import type { Lead } from '../../types/domain'
import { DetailSection, AgentAssigneeField, FlatField, FlatFieldGrid } from '../detail/FlatFields'

export function LeadDetailsPanel({
  lead,
  agentName,
  agentId,
}: {
  lead: Lead
  agentName: string | null
  agentId?: string | null
}) {
  return (
    <div className="space-y-10">
      <DetailSection title="Contact details" subtitle="How to reach this lead.">
        <FlatFieldGrid>
          <FlatField label="Full name" value={lead.name} />
          <FlatField icon={Mail} label="Email" value={lead.email} />
          <FlatField icon={Phone} label="Phone" value={lead.phone || '—'} />
          <FlatField label="Channel" value={lead.channel} />
          <FlatField label="Type" value={lead.type} />
          <AgentAssigneeField
            agentId={agentId ?? lead.agentId}
            agentName={agentName}
            label="Assigned agent"
          />
        </FlatFieldGrid>
      </DetailSection>

      <DetailSection title="Notes" subtitle="Context captured with this enquiry.">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-600">
          {lead.notes?.trim() || 'No notes yet.'}
        </p>
        <FlatFieldGrid className="border-t border-primary-50 pt-4 lg:grid-cols-2">
          <FlatField label="Created" value={lead.createdAt} tabular />
          <FlatField label="Last updated" value={lead.updatedAt} tabular />
        </FlatFieldGrid>
      </DetailSection>
    </div>
  )
}
