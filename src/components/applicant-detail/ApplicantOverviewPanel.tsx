import { Link } from 'react-router-dom'
import { Briefcase, CreditCard, IdCard, MapPin, ShieldCheck } from 'lucide-react'
import type { Application, PropertyAsset } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { Badge, Card, cn, statusTone } from '../ui'
import { StageRail } from '../WorkflowOverview'
import { APPLICATION_STAGES } from '../../lib/workflow'
import { ICON_STROKE } from './types'

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
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Personal details</h2>
        <p className="mt-1 text-sm text-ink-500">Identity and contact on file for this applicant.</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Meta label="Full name" value={application.applicantName} />
          <Meta label="Email" value={application.email} />
          <Meta label="Phone" value={application.phone || '—'} />
          <Meta
            icon={IdCard}
            label="ID / passport"
            value={application.idNumberOrPassport || '—'}
            tabular
          />
          <Meta
            icon={Briefcase}
            label="Employment"
            value={application.employment || '—'}
          />
          <Meta
            label="Declared income"
            value={application.income ? formatZAR(application.income) : '—'}
            tabular
          />
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Important details</h2>
        <p className="mt-1 text-sm text-ink-500">
          Credit posture, consent, and notes agents should know before proceeding.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-primary-100 bg-primary-50/40 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              Credit check
            </p>
            <Badge tone={statusTone(application.creditCheck)} className="mt-2">
              {application.creditCheck}
            </Badge>
            <p className="mt-2 text-sm text-ink-600">
              POPIA consent: {application.creditConsent ? 'Received' : 'Pending'}
            </p>
          </div>
          <div className="rounded-xl border border-primary-100 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
              <CreditCard className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              Assigned agent
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">{agentName ?? 'Unassigned'}</p>
            <p className="mt-1 text-xs text-ink-500">
              Submitted {application.submittedAt} · Updated {application.updatedAt}
            </p>
          </div>
        </div>
        {application.notes?.trim() && (
          <div className="mt-4 rounded-xl border border-primary-50 bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">
              {application.notes}
            </p>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Current apartment</h2>
        <p className="mt-1 text-sm text-ink-500">
          Where they are in the lifecycle for the property they are applying to now.
        </p>

        {property ? (
          <Link
            to={`/workspace/properties/${property.id}?tab=applicants`}
            className="mt-4 inline-flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-primary-100 bg-primary-50/50 px-4 text-left transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <MapPin className="h-4 w-4 shrink-0 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{property.title}</span>
              <span className="text-xs text-ink-500">
                {property.suburb}, {property.city} · {property.address}
              </span>
            </span>
            <Badge tone={statusTone(application.stage)}>{application.stage}</Badge>
          </Link>
        ) : (
          <p className="mt-4 text-sm text-ink-500">Property record not found.</p>
        )}

        <div className="mt-5 overflow-x-auto rounded-xl border border-primary-100 bg-white p-3 [scrollbar-width:thin]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
            System lifecycle
          </p>
          <StageRail stages={[...APPLICATION_STAGES]} current={application.stage} embedded />
        </div>
      </Card>
    </div>
  )
}

function Meta({
  label,
  value,
  icon: Icon,
  tabular,
}: {
  label: string
  value: string
  icon?: typeof IdCard
  tabular?: boolean
}) {
  return (
    <div className="rounded-xl border border-primary-50 px-3 py-3">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium text-ink-400">
        {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden /> : null}
        {label}
      </dt>
      <dd className={cn('mt-1 text-sm font-semibold text-ink', tabular && 'tabular')}>{value}</dd>
    </div>
  )
}
