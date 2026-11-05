/**
 * Non-amber PCR soft-gate status (Mode A honesty lives in FieldHelp only).
 */
import {
  findInspection,
  isIngoingPcrClearedForKeys,
  inspectionStatusLabel,
} from '../../lib/pcr'
import type { Application } from '../../types/domain'
import { Badge } from '../ui'

export function PcrGateStatus({
  application,
}: {
  application: Pick<Application, 'pcrInspections' | 'type'> | null | undefined
}) {
  if (!application || application.type === 'Purchase') return null
  const cleared = isIngoingPcrClearedForKeys(application)
  const incoming = findInspection(application, 'incoming')

  return (
    <div className="flex flex-wrap items-center gap-2" role="status" data-testid="pcr-soft-gate">
      <Badge tone={cleared ? 'success' : 'neutral'}>
        {cleared ? 'Move-in inspection signed' : 'Move-in inspection to sign'}
      </Badge>
      <p className="text-sm text-ink-500">
        {cleared ? (
          <>
            Signed by the agency and the tenant
            {incoming ? ` (${inspectionStatusLabel(incoming.status)})` : ''}.
          </>
        ) : (
          <>
            The agency signs the move-in inspection first, then the tenant signs it in their portal
            (now: {incoming ? inspectionStatusLabel(incoming.status) : 'not started'}).
          </>
        )}
      </p>
    </div>
  )
}
