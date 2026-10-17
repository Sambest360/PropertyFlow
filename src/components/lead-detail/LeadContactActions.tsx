import { Mail, MessageCircle, Phone } from 'lucide-react'
import type { AppUser, Lead, PropertyAsset } from '../../types/domain'
import { Button, cn } from '../ui'
import {
  mailtoUrlForLead,
  telUrlForLead,
  whatsappUrlForLead,
} from '../../lib/leadContact'
import { MESSAGING_MODE_A_SHORT } from '../../lib/messaging/modeA'
import { ICON_STROKE } from './types'

export function LeadContactActions({
  lead,
  property,
  portalUser,
  canContact,
  canInApp,
  onInApp,
  compact = false,
}: {
  lead: Lead
  property: PropertyAsset | null
  portalUser: AppUser | null
  canContact: boolean
  canInApp: boolean
  onInApp: () => void
  compact?: boolean
}) {
  if (!canContact) return null

  const mailto = mailtoUrlForLead(lead, property)
  const tel = telUrlForLead(lead)
  const whatsapp = whatsappUrlForLead(lead)
  const inAppEnabled = Boolean(portalUser && canInApp)

  const btnClass = compact
    ? 'min-h-9 min-w-9 px-2'
    : 'min-h-11'

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', compact && 'gap-1')}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      {tel ? (
        <Button
          type="button"
          variant="secondary"
          className={cn('cursor-pointer', btnClass)}
          title="Call"
          onClick={() => window.open(tel, '_self')}
        >
          <Phone className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          {!compact && 'Call'}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        className={cn('cursor-pointer', btnClass)}
        title={mailto ? 'Email' : 'No email on file'}
        disabled={!mailto}
        onClick={() => mailto && window.open(mailto, '_self')}
      >
        <Mail className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        {!compact && 'Email'}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className={cn('cursor-pointer', btnClass)}
        title={whatsapp ? 'Open WhatsApp' : 'No valid phone for WhatsApp'}
        disabled={!whatsapp}
        onClick={() => whatsapp && window.open(whatsapp, '_blank', 'noopener')}
      >
        <MessageCircle className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        {!compact && 'WhatsApp'}
      </Button>
      <Button
        type="button"
        className={cn('cursor-pointer', btnClass)}
        title={
          inAppEnabled
            ? MESSAGING_MODE_A_SHORT
            : portalUser
              ? 'Messaging permission required'
              : 'No portal account for this email'
        }
        disabled={!inAppEnabled}
        onClick={onInApp}
      >
        <MessageCircle className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        {!compact && 'Message in Lekaya'}
      </Button>
    </div>
  )
}
