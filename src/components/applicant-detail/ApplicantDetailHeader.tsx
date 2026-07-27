import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import type { Application } from '../../types/domain'
import { ICON_STROKE } from './types'

export function ApplicantDetailHeader({ application }: { application: Application }) {
  return (
    <div className="mb-5">
      <Link
        to="/workspace/sales/applications"
        className="mb-4 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        All applicants
      </Link>

      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
          {application.applicantName}
        </h1>
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
    </div>
  )
}
