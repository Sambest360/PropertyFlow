import { Mail, Phone } from 'lucide-react'
import type { AppUser } from '../../types/domain'
import { roleLabels } from '../../lib/permissions'
import { DetailSection, FlatField, FlatFieldGrid } from '../detail/FlatFields'

export function TeamDetailsPanel({
  user,
  agencyName,
}: {
  user: AppUser
  agencyName: string
}) {
  return (
    <DetailSection
      title="Personal details"
      subtitle="Contact and account information for this team member."
    >
      <FlatFieldGrid>
        <FlatField label="Full name" value={user.name} />
        <FlatField icon={Mail} label="Email" value={user.email} />
        <FlatField icon={Phone} label="Phone" value={user.phone || '—'} />
        <FlatField label="Role" value={roleLabels[user.role] ?? user.role} />
        <FlatField label="Agency" value={agencyName} />
        <FlatField label="Account status" value={user.active ? 'Active' : 'Inactive'} />
      </FlatFieldGrid>
    </DetailSection>
  )
}
