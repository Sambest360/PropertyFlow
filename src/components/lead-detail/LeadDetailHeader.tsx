import { Archive } from 'lucide-react'
import type { AppUser, Lead, PropertyAsset } from '../../types/domain'
import { ActionButtonRow } from '../ActionButtonRow'
import { BackButton } from '../BackButton'
import { Button } from '../ui'
import { isClosedLeadStage } from '../../lib/leadLifecycle'
import { ICON_STROKE } from './types'
import { LeadContactActions } from './LeadContactActions'
import { Mail, Phone } from 'lucide-react'

export function LeadDetailHeader({
  lead,
  property,
  portalUser,
  canContact,
  canInApp,
  onInApp,
  canClose,
  onClose,
}: {
  lead: Lead
  property: PropertyAsset | null
  portalUser: AppUser | null
  canContact: boolean
  canInApp: boolean
  onInApp: () => void
  canClose?: boolean
  onClose?: () => void
}) {
  return (
    <div className="mb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
            {lead.name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
              {lead.email}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
              {lead.phone || '—'}
            </span>
          </div>
        </div>

        <ActionButtonRow className="sm:w-auto sm:flex-wrap sm:justify-end">
          {canClose && onClose && !isClosedLeadStage(lead.stage) ? (
            <Button variant="secondary" className="min-h-11 cursor-pointer text-accent" onClick={onClose}>
              <Archive className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Close lead
            </Button>
          ) : null}
          <LeadContactActions
            lead={lead}
            property={property}
            portalUser={portalUser}
            canContact={canContact}
            canInApp={canInApp}
            onInApp={onInApp}
          />
          <BackButton to="/workspace/sales/crm" label="All leads" />
        </ActionButtonRow>
      </div>
    </div>
  )
}
