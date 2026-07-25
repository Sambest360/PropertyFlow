import { Link } from 'react-router-dom'
import { ArrowLeft, Ban, Mail, Phone } from 'lucide-react'
import type { Application } from '../../types/domain'
import { Badge, Button, cn, statusTone } from '../ui'
import { ICON_STROKE } from './types'

export function ApplicantDetailHeader({
  application,
  propertyTitle,
  isBlocked,
  canReview,
  onBlock,
}: {
  application: Application
  propertyTitle: string
  isBlocked: boolean
  canReview: boolean
  onBlock: () => void
}) {
  return (
    <div className="mb-5">
      <Link
        to="/workspace/sales/applications"
        className="mb-4 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        All applicants
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
              {application.applicantName}
            </h1>
            <Badge tone="brand">{application.type}</Badge>
            <Badge tone={statusTone(application.stage)}>{application.stage}</Badge>
            {isBlocked && <Badge tone="danger">Blocked history</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {application.id} · Applying for {propertyTitle}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
              {application.email}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
              {application.phone || '—'}
            </span>
          </div>
        </div>

        {canReview && application.stage !== 'Blocked' && application.stage !== 'Active Tenancy' && (
          <Button variant="danger" className="min-h-11 shrink-0" onClick={onBlock}>
            <Ban className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Block applicant
          </Button>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-ink-500">
          <span>Application progress</span>
          <span className={cn('tabular font-semibold text-ink')}>{application.progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-primary-50">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${application.progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}
