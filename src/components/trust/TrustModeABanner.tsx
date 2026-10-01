/**
 * Mode A Trust soft-demo honesty banner.
 * Not live PayProp / bank-confirmed — same pattern as lease e-sign / rent dunning.
 */
export const TRUST_MODE_A_COPY =
  'Mode A soft-demo / non-production trust book. Figures come from in-app seed and manual allocate/payout actions — not live PayProp or bank-confirmed balances. Bank CSV import/export and partner settlement need partner keys (not wired).'

export function TrustModeABanner({ extra }: { extra?: string }) {
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      role="status"
      data-testid="trust-mode-a-banner"
    >
      <strong>Trust soft-demo:</strong> {TRUST_MODE_A_COPY}
      {extra ? (
        <>
          {' '}
          <span>{extra}</span>
        </>
      ) : null}
    </div>
  )
}
