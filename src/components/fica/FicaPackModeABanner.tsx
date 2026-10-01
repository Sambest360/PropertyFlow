/**
 * DQ-C2 Mode A FICA pack honesty banner.
 * Staff-managed checklist — not live bureau / not live FICA verification.
 */
import { FICA_PACK_MODE_A_COPY, ficaPackGaps, isFicaPackVerified } from '../../lib/ficaPack'
import type { ApplicationDocument } from '../../types/domain'

export { FICA_PACK_MODE_A_COPY }

export function FicaPackModeABanner({
  documents,
  showGate = false,
}: {
  documents?: ApplicationDocument[] | null
  /** When true, also surface soft-gate gaps for lease/move-in. */
  showGate?: boolean
}) {
  const gaps = documents ? ficaPackGaps(documents) : []
  const packOk = documents ? isFicaPackVerified(documents) : false
  const gapLabels = gaps.map((k) =>
    k === 'id' ? 'ID' : k === 'address' ? 'proof of address' : 'FICA declaration',
  )

  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      role="status"
      data-testid="fica-pack-mode-a-banner"
    >
      <strong>FICA pack (Mode A):</strong> {FICA_PACK_MODE_A_COPY}
      {showGate && documents ? (
        <p className="mt-2 text-sm" data-testid="fica-pack-soft-gate">
          {packOk ? (
            <>FICA pack verified (id + address + fica). Lease / move-in soft gate clear.</>
          ) : (
            <>
              Soft gate: lease creation / move-in blocked until staff verify{' '}
              {gapLabels.join(', ')}.
            </>
          )}
        </p>
      ) : null}
    </div>
  )
}
