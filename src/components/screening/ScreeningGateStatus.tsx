/**
 * Non-amber screening soft-gate status (Mode A honesty lives in FieldHelp only).
 */
import {
  isScreeningClearedForLease,
  resolveScreening,
  screeningStatusLabel,
} from '../../lib/screening'
import type { Application } from '../../types/domain'
import { ProviderBadge } from '../integrations/ProviderBadge'
import { Badge } from '../ui'

export function ScreeningGateStatus({
  application,
}: {
  application: Pick<Application, 'screening' | 'creditCheck' | 'type'> | null | undefined
}) {
  if (!application || application.type === 'Purchase') return null
  const cleared = isScreeningClearedForLease(application)
  const status = resolveScreening(application as Application).status

  return (
    <div className="flex flex-wrap items-center gap-2" role="status" data-testid="screening-soft-gate">
      <ProviderBadge kind="screening" />
      <Badge tone={cleared ? 'success' : 'neutral'}>
        {cleared ? 'Credit check done' : 'Credit check to do'}
      </Badge>
      <p className="text-sm text-ink-500">
        {cleared ? (
          <>
            Credit check recorded ({screeningStatusLabel(status)}).
          </>
        ) : (
          <>
            Run the credit check outside the system, then upload the findings and approve the Credit check stage.
          </>
        )}
      </p>
    </div>
  )
}
