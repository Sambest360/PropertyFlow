/**
 * Non-amber screening soft-gate status (Mode A honesty lives in FieldHelp only).
 */
import {
  isScreeningClearedForLease,
  resolveScreening,
  screeningStatusLabel,
} from '../../lib/screening'
import type { Application } from '../../types/domain'
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
      <Badge tone={cleared ? 'success' : 'neutral'}>
        {cleared ? 'Screening cleared' : 'Screening gate open'}
      </Badge>
      <p className="text-sm text-ink-500">
        {cleared ? (
          <>
            Screening cleared ({screeningStatusLabel(status)}). Approve / lease / move-in soft gate
            clear.
          </>
        ) : (
          <>
            Soft gate: approve / lease / move-in blocked until screening is{' '}
            <strong>passed</strong> or recorded via audited <strong>manual override</strong>{' '}
            (current: {status ? screeningStatusLabel(status) : 'pending'}).
          </>
        )}
      </p>
    </div>
  )
}
