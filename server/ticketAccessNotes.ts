import { query as dbQuery } from './db.js'

/**
 * maintenance_tickets.access_notes (migration 013) may not be applied yet.
 * Checked once per process via information_schema and cached; while it is
 * missing the writer and bootstrap skip the column without error, and
 * bootstrap reports ticketAccessNotesSupported: false so the UI can say
 * "Not saved yet" instead of silently dropping input.
 */
type Q = (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>

let cached: Promise<boolean> | null = null

export function ticketAccessNotesColumnExists(q: Q = dbQuery as unknown as Q): Promise<boolean> {
  if (!cached) {
    cached = q(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'maintenance_tickets' AND column_name = 'access_notes'
        LIMIT 1`,
    )
      .then((rows) => rows.length > 0)
      .catch(() => {
        cached = null
        return false
      })
  }
  return cached
}

/** Tests only. */
export function resetTicketAccessNotesCache(): void {
  cached = null
}

/**
 * Writes access_notes from the payload accessNotes. Absent (undefined) keeps
 * the stored value; null / '' clears it. No-op while the column is missing.
 */
export async function writeTicketAccessNotes(
  ticketUuid: string,
  d: Record<string, unknown>,
  q: Q = dbQuery as unknown as Q,
): Promise<void> {
  if (d.accessNotes === undefined) return
  if (!(await ticketAccessNotesColumnExists(q))) return
  const v = typeof d.accessNotes === 'string' && d.accessNotes.trim() !== '' ? d.accessNotes.trim().slice(0, 2000) : null
  await q(`UPDATE maintenance_tickets SET access_notes = $2 WHERE id = $1::uuid`, [ticketUuid, v])
}

/** Bootstrap read: the row's access_notes as accessNotes (undefined when absent / empty). */
export function readTicketAccessNotes(row: Record<string, unknown>): string | undefined {
  const v = row.access_notes
  return typeof v === 'string' && v !== '' ? v : undefined
}
