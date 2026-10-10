import { query as dbQuery } from './db.js'

/**
 * maintenance_tickets.access_notes (migration 013) may not be applied yet.
 * Checked once per process via information_schema and cached; while it is
 * missing the writer and bootstrap skip the column without error, and
 * bootstrap reports ticketAccessNotesSupported: false so the UI can say
 * "Not saved yet" instead of silently dropping input.
 */
type Q = (sql: string, params: unknown[]) => Promise<unknown[]>

/** Settled result of the information_schema check (undefined until it succeeds). */
let known: boolean | undefined
let inflight: Promise<boolean> | null = null

const COLUMN_SQL = `SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'maintenance_tickets' AND column_name = 'access_notes'
        LIMIT 1`

/**
 * Runs the column check once per process and caches it. Throws (503
 * TICKET_ACCESS_NOTES_CHECK_FAILED) when the lookup itself fails, so a save
 * never reports success with the notes silently dropped; nothing is cached on
 * failure, the next save retries.
 *
 * upsertTicket calls this BEFORE opening its transaction (Jim #98): on Vercel
 * the pool max is 1, so a lookup from inside withTransaction would wait for a
 * second connection until the connect timeout. Running it first is also safe
 * after #89, where db.query() joins the active transaction through
 * AsyncLocalStorage: there is no active transaction yet at this point.
 */
export function ensureTicketAccessNotesColumn(q: Q = dbQuery as unknown as Q): Promise<boolean> {
  if (known !== undefined) return Promise.resolve(known)
  if (!inflight) {
    inflight = q(COLUMN_SQL, [])
      .then((rows) => {
        known = rows.length > 0
        return known
      })
      .catch((e: unknown) => {
        throw Object.assign(new Error('could not check the access notes column; try again'), {
          status: 503,
          code: 'TICKET_ACCESS_NOTES_CHECK_FAILED',
          cause: e,
        })
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/**
 * Bootstrap flag: fail-closed. A failed check reports false, so the UI shows
 * "Not saved yet" and disables the field.
 */
export function ticketAccessNotesColumnExists(q: Q = dbQuery as unknown as Q): Promise<boolean> {
  return ensureTicketAccessNotesColumn(q).catch(() => false)
}

/** Cached result only (no query). */
export function cachedTicketAccessNotesColumn(): boolean | undefined {
  return known
}

/** Tests only. */
export function resetTicketAccessNotesCache(): void {
  known = undefined
  inflight = null
}

/**
 * Writes access_notes from the payload accessNotes on `q` (the caller's
 * transaction). Absent (undefined) keeps the stored value; null / '' clears
 * it. Uses ONLY the cached column check, never a second connection: the caller
 * must await ensureTicketAccessNotesColumn() first, else this throws rather
 * than dropping the notes. No-op while the column is missing.
 */
export async function writeTicketAccessNotes(
  ticketUuid: string,
  d: Record<string, unknown>,
  q: Q = dbQuery as unknown as Q,
): Promise<void> {
  if (d.accessNotes === undefined) return
  assertTicketAccessNotes(d)
  if (known === undefined) {
    throw Object.assign(new Error('access notes column check not run before the write'), {
      status: 500,
      code: 'TICKET_ACCESS_NOTES_CHECK_FAILED',
    })
  }
  if (!known) return
  const v = typeof d.accessNotes === 'string' && d.accessNotes.trim() !== '' ? d.accessNotes.trim() : null
  await q(`UPDATE maintenance_tickets SET access_notes = $2 WHERE id = $1::uuid`, [ticketUuid, v])
}

export const TICKET_ACCESS_NOTES_MAX = 1000

/** 400 TICKET_ACCESS_NOTES_TOO_LONG when accessNotes is over 1000 characters (no silent cut). */
export function assertTicketAccessNotes(d: Record<string, unknown>): void {
  const v = d.accessNotes
  if (typeof v === 'string' && v.trim().length > TICKET_ACCESS_NOTES_MAX) {
    throw Object.assign(new Error(`access notes are limited to ${TICKET_ACCESS_NOTES_MAX} characters`), {
      status: 400,
      code: 'TICKET_ACCESS_NOTES_TOO_LONG',
    })
  }
}

/** Bootstrap read: the row's access_notes as accessNotes (undefined when absent / empty). */
export function readTicketAccessNotes(row: Record<string, unknown>): string | undefined {
  const v = row.access_notes
  return typeof v === 'string' && v !== '' ? v : undefined
}
