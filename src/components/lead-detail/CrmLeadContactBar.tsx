import type { Lead, PropertyAsset } from '../../types/domain'
import { useLeadContact } from '../../hooks/useLeadContact'
import { LeadContactActions } from './LeadContactActions'
import { LeadMessageModal } from './LeadMessageModal'

export function CrmLeadContactBar({
  lead,
  property,
  compact = true,
}: {
  lead: Lead
  property: PropertyAsset | null
  compact?: boolean
}) {
  const {
    portalUser,
    canContact,
    canInApp,
    composeOpen,
    setComposeOpen,
    startInApp,
    sendFirstMessage,
  } = useLeadContact(lead, property)

  return (
    <>
      <LeadContactActions
        lead={lead}
        property={property}
        portalUser={portalUser}
        canContact={canContact}
        canInApp={canInApp}
        onInApp={startInApp}
        compact={compact}
      />
      <LeadMessageModal
        open={composeOpen}
        leadName={lead.name}
        onClose={() => setComposeOpen(false)}
        onSend={sendFirstMessage}
      />
    </>
  )
}
