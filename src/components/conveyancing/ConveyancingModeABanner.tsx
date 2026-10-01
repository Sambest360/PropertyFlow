/**
 * Mode A conveyancing soft-demo honesty banner.
 * Checklist / status only — not live attorney, Deeds Office, or bond partner.
 */
export const CONVEYANCING_MODE_A_COPY =
  'Mode A soft-demo / non-production conveyancing. Closing checklist and status labels are staff-recorded in-app only — not a live attorney portal, Deeds Office e-filing, or bank bond-approval feed. Bond/transfer calculators remain estimates (not a quote).'

export function ConveyancingModeABanner({ extra }: { extra?: string }) {
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      role="status"
      data-testid="conveyancing-mode-a-banner"
    >
      <strong>Conveyancing soft-demo:</strong> {CONVEYANCING_MODE_A_COPY}
      {extra ? (
        <>
          {' '}
          <span>{extra}</span>
        </>
      ) : null}
    </div>
  )
}
