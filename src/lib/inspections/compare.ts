/** Display helpers for the move-in / move-out comparison (pure; tested). */

export type CompareTone = 'red' | 'amber' | 'grey' | 'neutral'

export type ComparePhoto = { documentId: string; url: string; uploadedAt: string; uploaderRole?: string }

export type CompareRow = {
  itemId: string
  itemName: string
  moveInCondition: string | null
  moveInPhotos: ComparePhoto[]
  moveOutCondition: string | null
  moveOutPhotos: ComparePhoto[]
  outcome: string | null
  tone: CompareTone
  amountCents: number
  addendum?: boolean
}

export type CompareBody = {
  inspectionId: string
  leaseId: string
  type: string
  status: string
  deemedGoodOrder: boolean
  warning: string | null
  rows: CompareRow[]
  totalCents: number
  remainderCents: number
  capCents: number
  capped: boolean
  deadlineNote: string
  suggestions: Array<{ id: string; description: string; amountCents: number; status: string }>
}

export function formatCents(cents: number): string {
  const rands = Math.round(cents) / 100
  return `R ${rands.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const OUTCOME_LABEL: Record<string, string> = {
  OK: 'OK',
  DAMAGED: 'Damaged',
  MISSING: 'Missing',
  WEAR_AND_TEAR: 'Wear and tear',
}

/** Row colours: red Missing, amber Damaged, grey wear and tear. */
export function toneClasses(tone: CompareTone): string {
  if (tone === 'red') return 'border-red-200 bg-red-50 text-red-900'
  if (tone === 'amber') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (tone === 'grey') return 'border-stone-200 bg-stone-100 text-stone-600'
  return 'border-primary-100 bg-white text-ink'
}

/** Running deduction total per row, never above the deposit + interest cap. */
export function withRunningTotal(rows: CompareRow[], capCents: number): Array<CompareRow & { runningCents: number }> {
  let running = 0
  return rows.map((row) => {
    // Wear and tear never counts, whatever amount came back.
    const add = row.outcome === 'WEAR_AND_TEAR' ? 0 : Math.max(0, row.amountCents)
    running = Math.min(capCents, running + add)
    return { ...row, runningCents: running }
  })
}
