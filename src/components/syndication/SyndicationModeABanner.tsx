/**
 * DQ syndication Mode A honesty banner.
 * Own-site / manual pack — not live P24/PP.
 */
import { SYNDICATION_MODE_A_COPY } from '../../lib/syndication'

export { SYNDICATION_MODE_A_COPY }

export function SyndicationModeABanner({ extra }: { extra?: string }) {
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      role="status"
      data-testid="syndication-mode-a-banner"
    >
      <strong>Syndication (Mode A):</strong> {SYNDICATION_MODE_A_COPY}
      {extra ? (
        <>
          {' '}
          <span>{extra}</span>
        </>
      ) : null}
    </div>
  )
}
