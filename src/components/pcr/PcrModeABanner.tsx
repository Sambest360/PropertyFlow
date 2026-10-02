/**
 * PCR / inspections Mode A honesty banner.
 * Soft PCR pack beside occupancy — not PropertyInspect parity / not RHA legal advice.
 */
import {
  PCR_MODE_A_COPY,
  findInspection,
  isIngoingPcrClearedForKeys,
  inspectionStatusLabel,
} from '../../lib/pcr'
import type { Application } from '../../types/domain'

export { PCR_MODE_A_COPY }

export function PcrModeABanner({
  application,
  showGate = false,
}: {
  application?: Pick<Application, 'pcrInspections' | 'type'> | null
  /** When true, surface soft-gate status for keys / move-in. */
  showGate?: boolean
}) {
  const rental = application?.type !== 'Purchase'
  const cleared = application && rental ? isIngoingPcrClearedForKeys(application) : false
  const incoming = application && rental ? findInspection(application, 'incoming') : null

  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      role="status"
      data-testid="pcr-mode-a-banner"
    >
      <strong>PCR / inspections (Mode A):</strong> {PCR_MODE_A_COPY}
      <p className="mt-2 text-sm">
        Safe claim: joint-style soft PCR pack beside occupancy — not a full field PCR product.
      </p>
      {showGate && application && rental ? (
        <p className="mt-2 text-sm" data-testid="pcr-soft-gate">
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
              (current: {incoming ? inspectionStatusLabel(incoming.status) : 'no inspection yet'} —
              not PropertyInspect parity).
            </>
          )}
        </p>
      ) : null}
    </div>
  )
}
