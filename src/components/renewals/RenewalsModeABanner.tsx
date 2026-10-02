/**
 * §5 Mode A honesty banner — renewals + scheduled escalation.
 * Not CPA legal service / not live notice / not live CPI.
 */
import { RENEWALS_MODE_A_COPY } from '../../lib/renewals'

export { RENEWALS_MODE_A_COPY }

export function RenewalsModeABanner({ extra }: { extra?: string }) {
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      role="status"
      data-testid="renewals-mode-a-banner"
    >
      <strong>Renewals / escalation (Mode A):</strong> {RENEWALS_MODE_A_COPY}
      <p className="mt-2 text-sm">
        Safe claim: soft year-ops renewal clock + escalate/renew/decline + scheduled book
        increase — in-app only; not CPA legal service / live notice / live CPI.
      </p>
      {extra ? (
        <p className="mt-2 text-sm">
          <span>{extra}</span>
        </p>
      ) : null}
    </div>
  )
}
