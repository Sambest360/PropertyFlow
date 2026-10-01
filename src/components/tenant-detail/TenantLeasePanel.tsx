import { Link } from 'react-router-dom'
import { FileText, KeyRound, PenLine } from 'lucide-react'
import type { Tenancy } from '../../types/domain'
import { Badge, statusTone } from '../ui'
import { formatZAR } from '../../data/seed'
import { DetailSection, FlatField, FlatFieldGrid } from '../detail/FlatFields'
import { eSignStatusLabel } from '../../lib/lease'
import { ICON_STROKE } from './types'

export function TenantLeasePanel({ tenancy }: { tenancy: Tenancy }) {
  const eSign = tenancy.eSign
  const pdfUrl = tenancy.leasePdfUrl || eSign?.pdfUrl || null
  const signLabel = eSign ? eSignStatusLabel(eSign.status) : 'Not issued'

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
        title="Lease PDF & e-sign"
        subtitle="Generated on approve. Mock e-sign is non-production; live SigniFlow/DocuSign needs partner keys."
      >
        <FlatFieldGrid className="lg:grid-cols-2">
          <FlatField label="E-sign status" value={signLabel} />
          <FlatField
            label="Provider"
            value={
              eSign
                ? `${eSign.provider}${eSign.nonProduction ? ' (non-production)' : eSign.live ? ' (live)' : ''}`
                : '—'
            }
          />
          <FlatField
            label="Tenant signature"
            value={
              eSign?.tenant.status === 'signed'
                ? `Signed${eSign.tenant.signerName ? ` — ${eSign.tenant.signerName}` : ''}${
                    eSign.tenant.signedAt ? ` (${eSign.tenant.signedAt.slice(0, 10)})` : ''
                  }`
                : eSign
                  ? 'Pending'
                  : '—'
            }
          />
          <FlatField
            label="Landlord countersign"
            value={
              !eSign
                ? '—'
                : !eSign.landlord
                  ? 'Not required (no landlordId)'
                  : eSign.landlord.status === 'signed'
                    ? `Signed${eSign.landlord.signerName ? ` — ${eSign.landlord.signerName}` : ''}${
                        eSign.landlord.signedAt ? ` (${eSign.landlord.signedAt.slice(0, 10)})` : ''
                      }`
                    : 'Pending'
            }
          />
        </FlatFieldGrid>
        <div className="mt-4 flex flex-wrap gap-3">
          {pdfUrl ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary/30 bg-white px-4 text-sm font-semibold text-primary hover:bg-primary-50"
            >
              <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Open lease PDF
            </a>
          ) : (
            <p className="text-sm text-ink-500">No lease PDF yet — issue from People → Leases.</p>
          )}
          <Link
            to="/workspace/people/leases"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <PenLine className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Manage leases & e-sign
          </Link>
        </div>
        {eSign?.note ? <p className="mt-3 text-xs text-ink-500">{eSign.note}</p> : null}
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
