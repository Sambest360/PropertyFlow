import { Mail, Phone } from 'lucide-react'
import type { Application } from '../../types/domain'
import { BackButton } from '../BackButton'
import { ICON_STROKE } from './types'

export function ApplicantDetailHeader({ application }: { application: Application }) {
  return (
    <div className="mb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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

        <BackButton to="/workspace/sales/applications" label="All applicants" />
      </div>
    </div>
  )
}
