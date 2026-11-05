/**
 * Non-amber FICA pack soft-gate status (Mode A honesty lives in FieldHelp only).
 */
import { ficaPackGaps, isFicaPackVerified } from '../../lib/ficaPack'
import type { ApplicationDocument } from '../../types/domain'
import { Badge } from '../ui'

export function FicaPackGateStatus({
  documents,
}: {
  documents: ApplicationDocument[] | null | undefined
}) {
  if (!documents) return null
  const gaps = ficaPackGaps(documents)
  const packOk = isFicaPackVerified(documents)
  const gapLabels = gaps.map((k) =>
    k === 'id' ? 'ID' : k === 'address' ? 'proof of address' : 'FICA declaration',
  )

  return (
    <div className="flex flex-wrap items-center gap-2" role="status" data-testid="fica-pack-soft-gate">
      <Badge tone={packOk ? 'success' : 'neutral'}>
        {packOk ? 'Identity documents checked' : 'Identity documents to check'}
      </Badge>
      <p className="text-sm text-ink-500">
        {packOk ? (
          <>ID, proof of address and FICA declaration are checked.</>
        ) : (
          <>
            Still to check: {gapLabels.join(', ')}.
          </>
        )}
      </p>
    </div>
  )
}
