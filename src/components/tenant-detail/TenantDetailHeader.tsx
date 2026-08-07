import { Mail } from 'lucide-react'
import type { Tenancy } from '../../types/domain'
import { ActionButtonRow } from '../ActionButtonRow'
import { BackButton } from '../BackButton'
import { ICON_STROKE } from './types'

export function TenantDetailHeader({ tenancy }: { tenancy: Tenancy }) {
  return (
    <div className="mb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
            {tenancy.tenantName}
          </h1>
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-ink-600">
            <Mail className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
            {tenancy.tenantEmail}
          </p>
        </div>

        <ActionButtonRow className="sm:w-auto">
          <BackButton to="/workspace/people/tenants" label="All tenants" />
        </ActionButtonRow>
      </div>
    </div>
  )
}
