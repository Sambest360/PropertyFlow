import { Link } from 'react-router-dom'
import { ArrowLeft, Mail } from 'lucide-react'
import type { Tenancy } from '../../types/domain'
import { ICON_STROKE } from './types'

export function TenantDetailHeader({ tenancy }: { tenancy: Tenancy }) {
  return (
    <div className="mb-5">
      <Link
        to="/workspace/people/tenants"
        className="mb-4 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        All tenants
      </Link>

      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
          {tenancy.tenantName}
        </h1>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-ink-600">
          <Mail className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
          {tenancy.tenantEmail}
        </p>
      </div>
    </div>
  )
}
