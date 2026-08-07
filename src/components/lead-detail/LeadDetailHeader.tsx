import { Archive, Mail, MessageCircle, Phone } from 'lucide-react'
import type { Lead } from '../../types/domain'
import { BackButton } from '../BackButton'
import { Button } from '../ui'
import { isClosedLeadStage } from '../../lib/leadLifecycle'
import { ICON_STROKE } from './types'

export function LeadDetailHeader({
  lead,
  canManage,
  canClose,
  onClose,
}: {
  lead: Lead
  canManage: boolean
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

        <div className="flex flex-wrap gap-2">
          {canClose && onClose && !isClosedLeadStage(lead.stage) ? (
            <Button variant="secondary" className="min-h-11 cursor-pointer text-accent" onClick={onClose}>
              <Archive className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Close lead
            </Button>
          ) : null}
          {canManage ? (
            <>
              <Button
                variant="secondary"
                className="min-h-11"
                onClick={() => window.open(`tel:${lead.phone}`, '_self')}
              >
                <Phone className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Call
              </Button>
              <Button
                variant="secondary"
                className="min-h-11"
                onClick={() => window.open(`mailto:${lead.email}`, '_self')}
              >
                <Mail className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Email
              </Button>
              <Button
                variant="secondary"
                className="min-h-11"
                onClick={() =>
                  window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}`, '_blank', 'noopener')
                }
              >
                <MessageCircle className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                WhatsApp
              </Button>
            </>
          ) : null}
          <BackButton to="/workspace/sales/crm" label="All leads" />
        </div>
      </div>
    </div>
  )
}
