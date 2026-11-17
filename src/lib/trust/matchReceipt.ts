/**
 * Suggest which occupancy an unallocated trust receipt belongs to.
 * Suggestions only: a person still confirms every allocation.
 */
import type { Tenancy } from '../../types/domain'

export type ReceiptMatch = {
  occupancyId: string
  score: number
  reasons: string[]
  /** Cents to prefill: what is owed, else monthly rent, capped at the receipt. */
  suggestedCents: number
}

const MIN_SCORE = 30
const NOISE = new Set(['the', 'and', 'mrs', 'miss', 'rent', 'flat', 'unit', 'deposit', 'payment'])

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      // Drop the "[CSV import — …]" honesty label the importer appends.
      .replace(/\[[^\]]*\]/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !NOISE.has(t)),
  )
}

export function suggestReceiptMatches(
  receipt: { amountCents: number; description: string; bankRef?: string | null },
  tenancies: readonly Pick<Tenancy, 'id' | 'tenantName' | 'rent'>[],
  owedCentsByOccupancy: ReadonlyMap<string, number>,
  limit = 3,
): ReceiptMatch[] {
  const text = tokens(`${receipt.description} ${receipt.bankRef ?? ''}`)
  const out: ReceiptMatch[] = []
  for (const t of tenancies) {
    const reasons: string[] = []
    let score = 0
    const nameHits = [...tokens(t.tenantName)].filter((w) => text.has(w))
    if (nameHits.length > 0) {
      score += 40 + 10 * (nameHits.length - 1)
      reasons.push('Name in reference')
    }
    const rentCents = Math.round(t.rent * 100)
    const owed = owedCentsByOccupancy.get(t.id) ?? 0
    if (owed > 0 && owed === receipt.amountCents) {
      score += 40
      reasons.push('Equals amount owed')
    } else if (rentCents > 0 && rentCents === receipt.amountCents) {
      score += 30
      reasons.push('Equals monthly rent')
    }
    if (score < MIN_SCORE) continue
    out.push({
      occupancyId: t.id,
      score,
      reasons,
      suggestedCents: Math.min(receipt.amountCents, owed > 0 ? owed : rentCents || receipt.amountCents),
    })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}
