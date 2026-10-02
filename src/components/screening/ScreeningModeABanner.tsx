/**
 * DQ-C3 Mode A screening honesty banner.
 * In-app / mock / manual bureau — not live TPN.
 */
import {
  SCREENING_MODE_A_COPY,
  isScreeningClearedForLease,
  resolveScreening,
  screeningStatusLabel,
} from '../../lib/screening'
import type { Application } from '../../types/domain'

export { SCREENING_MODE_A_COPY }

export function ScreeningModeABanner({
  application,
  showGate = false,
}: {
  application?: Pick<Application, 'screening' | 'creditCheck' | 'type'> | null
  /** When true, also surface soft-gate status for approve / lease / move-in. */
  showGate?: boolean
}) {
  const rental = application?.type !== 'Purchase'
  const cleared = application && rental ? isScreeningClearedForLease(application) : false
  const status = application && rental ? resolveScreening(application as Application).status : null

  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      role="status"
      data-testid="screening-mode-a-banner"
    >
      <strong>Screening (Mode A):</strong> {SCREENING_MODE_A_COPY}
      {showGate && application && rental ? (
        <p className="mt-2 text-sm" data-testid="screening-soft-gate">
          {cleared ? (
            <>
              Screening cleared ({screeningStatusLabel(status!)}). Approve / lease / move-in soft
              gate clear.
            </>
          ) : (
            <>
              Soft gate: approve / lease / move-in blocked until screening is{' '}
              <strong>passed</strong> or recorded via audited <strong>manual override</strong>{' '}
              (current: {status ? screeningStatusLabel(status) : 'pending'} — not live TPN).
            </>
          )}
        </p>
      ) : null}
    </div>
  )
}
