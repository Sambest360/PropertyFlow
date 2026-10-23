import type { Viewing } from '../../types/domain'
import { tenantConsentLabel } from '../../lib/viewingConsent'
import { Badge } from '../ui'

/** Renders nothing unless an occupied-home viewing is waiting on, or was declined by, the tenant. */
export function TenantConsentBadge({ viewing }: { viewing: Pick<Viewing, 'status' | 'tenantConsentStatus'> }) {
  const c = tenantConsentLabel(viewing)
  if (!c) return null
  return (
    <Badge tone={c.tone}>
      <span title={c.title} data-testid="tenant-consent-badge">
        {c.label}
      </span>
    </Badge>
  )
}
