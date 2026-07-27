import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import type { Tenancy } from '../../types/domain'
import { Badge, statusTone } from '../ui'
import { formatZAR } from '../../data/seed'
import { DetailSection, FlatField, FlatFieldGrid } from '../detail/FlatFields'
import { ICON_STROKE } from './types'

export function TenantLeasePanel({ tenancy }: { tenancy: Tenancy }) {
  return (
    <div className="space-y-10">
      <DetailSection title="Lease terms" subtitle="Dates, rent, and deposit for this occupancy.">
        <FlatFieldGrid>
          <FlatField label="Status" value={tenancy.status} />
          <FlatField label="Start date" value={tenancy.startDate} />
          <FlatField label="End date" value={tenancy.endDate ?? 'Open-ended'} />
          <FlatField label="Monthly rent" value={formatZAR(tenancy.rent)} tabular />
          <FlatField label="Deposit" value={formatZAR(tenancy.deposit)} tabular />
        </FlatFieldGrid>
        <div className="pt-1">
          <Badge tone={statusTone(tenancy.status)}>{tenancy.status}</Badge>
        </div>
        {tenancy.applicationId && (
          <Link
            to={`/workspace/sales/applications/${encodeURIComponent(tenancy.applicationId)}`}
            className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary hover:underline"
          >
            Open linked application
          </Link>
        )}
      </DetailSection>

      <DetailSection
        title="Key collection"
        subtitle="Where and how keys were or will be handed over."
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <KeyRound className="h-4 w-4 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
          {tenancy.keyCollection.location}
        </p>
        <p className="mt-2 text-sm text-ink-600">{tenancy.keyCollection.instructions}</p>
        <FlatFieldGrid className="mt-4 border-t border-primary-50 pt-4 lg:grid-cols-2">
          <FlatField label="Contact" value={tenancy.keyCollection.contactName} />
          <FlatField label="Phone" value={tenancy.keyCollection.contactPhone || '—'} />
        </FlatFieldGrid>
      </DetailSection>
    </div>
  )
}
