/**
 * Mode A Trust honesty banner.
 * Manual/template CSV + in-app allocate — not live PayProp / bank-confirmed.
 */
export const TRUST_MODE_A_COPY =
  'Mode A soft-demo / non-production trust book. Manual/template CSV ingest and allocate/suspense write to the app database — not live PayProp or bank-confirmed balances. Partner settlement and live bank feeds are not wired.'

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
