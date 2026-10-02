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
        {cleared ? 'Incoming PCR cleared' : 'PCR gate open'}
      </Badge>
      <p className="text-sm text-ink-500">
        {cleared ? (
          <>
            Incoming PCR cleared
            {incoming ? ` (${inspectionStatusLabel(incoming.status)})` : ''}. Keys / move-in soft
            gate clear.
          </>
        ) : (
          <>
            Soft gate: keys / move-in blocked until incoming PCR is <strong>soft-signed</strong>{' '}
            (staff + tenant ack) or recorded via audited <strong>no-show / admin override</strong>{' '}
            (current: {incoming ? inspectionStatusLabel(incoming.status) : 'no inspection yet'}).
          </>
        )}
      </p>
    </div>
  )
}
