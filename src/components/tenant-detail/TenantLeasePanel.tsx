import { Link } from 'react-router-dom'
import { FileText, KeyRound, PenLine } from 'lucide-react'
import type { Tenancy } from '../../types/domain'
import { Badge, statusTone } from '../ui'
import { formatZAR } from '../../data/seed'
import { DetailSection, FlatField, FlatFieldGrid } from '../detail/FlatFields'
import { eSignStatusLabel } from '../../lib/lease'
import { ICON_STROKE } from './types'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { FieldHelp } from '../onboarding/FieldHelp'
import { RENEWALS_MODE_A_COPY } from '../../lib/renewals'
import { LeaseRenewalsPanel } from '../renewals/LeaseRenewalsPanel'

export function TenantLeasePanel({ tenancy }: { tenancy: Tenancy }) {
  const {
    offerLeaseRenewal,
    acceptLeaseRenewal,
    declineLeaseRenewal,
    markLeaseMonthToMonth,
    sendCpaExpiryNotice,
    setLeaseEscalation,
    applyDueLeaseEscalations,
    notify,
    state,
  } = useStore()
  const { user } = useAuth()
  const live = state.tenancies.find((t) => t.id === tenancy.id) ?? tenancy
  const eSign = live.eSign
  const pdfUrl = live.leasePdfUrl || eSign?.pdfUrl || null
  const signLabel = eSign ? eSignStatusLabel(eSign.status) : 'Not issued'
  const propertyTitle =
    state.properties.find((p) => p.id === live.propertyId)?.title ?? live.propertyId

  const notifyActor = (title: string, body: string) => {
    notify({
      userId: user?.id ?? 'system',
      agencyId: user?.agencyId ?? live.agencyId,
      title,
      body,
    })
  }

  return (
    <div className="space-y-10">
      <DetailSection title="Lease terms" subtitle="Dates, rent, and deposit for this occupancy.">
        <FlatFieldGrid>
          <FlatField label="Status" value={live.status} />
          <FlatField label="Start date" value={live.startDate} />
          <FlatField label="End date" value={live.endDate ?? 'Open-ended'} />
          <FlatField label="Monthly rent" value={formatZAR(live.rent)} tabular />
          <FlatField label="Deposit" value={formatZAR(live.deposit)} tabular />
        </FlatFieldGrid>
        <div className="pt-1">
          <Badge tone={statusTone(live.status)}>{live.status}</Badge>
        </div>
        {live.applicationId && (
          <Link
            to={`/workspace/sales/applications/${encodeURIComponent(live.applicationId)}`}
            className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary hover:underline"
          >
            Open linked application
          </Link>
        )}
      </DetailSection>

      <DetailSection
        title="Renewals & scheduled escalation"
        subtitle="Year-ops clock beside this lease — in-app book only."
        actions={<FieldHelp title="Renewals / escalation" body={RENEWALS_MODE_A_COPY} />}
      >
        <div className="space-y-3">
          <LeaseRenewalsPanel
            tenancy={live}
            propertyTitle={propertyTitle}
            handlers={{
              onOffer: ({ tenancyId, offeredEndDate, offeredRent, termMonths }) => {
                const res = offerLeaseRenewal(tenancyId, {
                  offeredEndDate,
                  offeredRent,
                  termMonths,
                })
                if (res.ok) notifyActor('Renewal offered', 'In-app renewal terms recorded (Mode A).')
                else notifyActor('Offer failed', 'reason' in res ? res.reason : 'Unknown error')
              },
              onAccept: (tenancyId) => {
                const res = acceptLeaseRenewal(tenancyId)
                if (res.ok) {
                  notifyActor(
                    'Renewal accepted',
                    `Book extended to ${res.newEndDate}; rent ${formatZAR(res.newRent)}.`,
                  )
                } else notifyActor('Accept failed', 'reason' in res ? res.reason : 'Unknown error')
              },
              onDecline: (tenancyId) => {
                const res = declineLeaseRenewal(tenancyId)
                if (res.ok) notifyActor('Renewal declined', `Notice given (${res.noticeGivenAt}).`)
                else notifyActor('Decline failed', 'reason' in res ? res.reason : 'Unknown error')
              },
              onMonthToMonth: (tenancyId) => {
                const res = markLeaseMonthToMonth(tenancyId)
                if (res.ok) {
                  notifyActor(
                    'Month-to-month noted',
                    'Continuing month-to-month on book (not auto 12-mo).',
                  )
                } else notifyActor('Note failed', 'reason' in res ? res.reason : 'Unknown error')
              },
              onSendCpaNotice: (tenancyId) => {
                const res = sendCpaExpiryNotice(tenancyId)
                if (res.ok) {
                  notifyActor(
                    'CPA-style notice recorded',
                    `In-app cpa_expiry_notice${res.late ? ' (late; seek counsel)' : ''}.`,
                  )
                } else notifyActor('Notice failed', 'reason' in res ? res.reason : 'Unknown error')
              },
              onSetEscalation: ({ tenancyId, escalationPct, nextEscalationOn }) => {
                const res = setLeaseEscalation(tenancyId, {
                  escalationPct,
                  nextEscalationOn,
                })
                if (res.ok) notifyActor('Escalation saved', 'Staff-set % (not live CPI).')
                else notifyActor('Save failed', 'reason' in res ? res.reason : 'Unknown error')
              },
              onApplyEscalation: () => {
                const result = applyDueLeaseEscalations()
                notifyActor(
                  'Escalation apply',
                  `Applied ${result.applied} due increase(s) (Mode A).`,
                )
              },
            }}
          />
        </div>
      </DetailSection>

      <DetailSection
        title="Lease PDF & e-sign"
        subtitle="Generated on approve. Mock is non-production soft-demo; live SigniFlow needs server keys. DocuSign stays placeholder."
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
          {live.keyCollection.location}
        </p>
        <p className="mt-2 text-sm text-ink-600">{live.keyCollection.instructions}</p>
        <FlatFieldGrid className="mt-4 border-t border-primary-50 pt-4 lg:grid-cols-2">
          <FlatField label="Contact" value={live.keyCollection.contactName} />
          <FlatField label="Phone" value={live.keyCollection.contactPhone || '—'} />
        </FlatFieldGrid>
      </DetailSection>
    </div>
  )
}
