/**
 * Save trust rows one by one, stopping at the first refused save, so callers
 * can undo their optimistic state and tell the user instead of reporting a
 * success that is gone on the next reload. Trust rows are never deleted
 * through persist, so rows saved before the failure stay saved.
 */
export async function persistInOrder<T>(
  rows: readonly T[],
  persist: (row: T) => Promise<boolean>,
): Promise<{ saved: T[]; failed: T | null }> {
  const saved: T[] = []
  for (const row of rows) {
    let ok = false
    try {
      ok = await persist(row)
    } catch {
      ok = false
    }
    if (!ok) return { saved, failed: row }
    saved.push(row)
  }
  return { saved, failed: null }
}

export const TRUST_SAVE_FAILED = 'Not saved. Check your connection and try again.'

/** Allocation lines saved before a later line was refused. */
export function allocationSaveFailedMessage(savedLines: number, totalLines: number): string {
  if (savedLines === 0) return 'Allocation was not saved. Check your connection and try again.'
  return `Only ${savedLines} of ${totalLines} allocation lines were saved, so the receipt stays unallocated. Ask an admin to check it before allocating again.`
}

export function csvImportSaveFailedMessage(savedRows: number, totalRows: number): string {
  return `Saved ${savedRows} of ${totalRows} receipts. Import the file again to retry the rest.`
}
