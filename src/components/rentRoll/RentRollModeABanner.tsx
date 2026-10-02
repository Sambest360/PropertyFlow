/**
 * §5 Mode A honesty banner — rent roll + soft audit pack.
 * Not trust-audited / not PPRA / not bank-confirmed.
 */
import { AUDIT_PACK_MODE_A_COPY, RENT_ROLL_MODE_A_COPY } from '../../lib/rentRoll'

export { RENT_ROLL_MODE_A_COPY, AUDIT_PACK_MODE_A_COPY }

export function RentRollModeABanner({ extra }: { extra?: string }) {
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      role="status"
      data-testid="rent-roll-mode-a-banner"
    >
      <strong>Rent roll / soft audit pack (Mode A):</strong> {RENT_ROLL_MODE_A_COPY}{' '}
      {AUDIT_PACK_MODE_A_COPY}
      {extra ? (
        <>
          {' '}
          <span>{extra}</span>
        </>
      ) : null}
    </div>
  )
}
