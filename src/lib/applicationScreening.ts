/**
 * Screening identity and income live in `application_screening` (migration 011),
 * not in the application `notes` / `message` column.
 *
 * Columns this code writes:
 * - application_id (primary key, the applications row uuid)
 * - id_type ('sa_id' | 'passport')
 * - id_number text
 * - gross_monthly_income_cents bigint
 */
import { parseIdentityDocument } from './saId'
import { parseZarToCents, randsFromCents } from './money/zarToCents'

export type ScreeningIdType = 'sa_id' | 'passport'

export type ApplicationScreeningInsert = {
  application_id: string
  id_type: ScreeningIdType
  id_number: string
  gross_monthly_income_cents: number
}

const SCREENING_NOTE_LINE =
  /^\s*(monthly income|gross monthly income|id\s*\/\s*passport|id number)\s*:/i

/** Drop ID and income lines that used to be appended to application or lead notes. */
export function notesWithoutScreening(notes: string): string {
  return notes
    .split('\n')
    .filter((line) => !SCREENING_NOTE_LINE.test(line))
    .join('\n')
    .trim()
}

export type ScreeningDraft =
  | {
      ok: true
      idType: ScreeningIdType
      idNumber: string
      grossMonthlyIncomeCents: number
      incomeRands: number
    }
  | { ok: false; idMessage?: string; incomeMessage?: string }

/** Validate the application form. Invalid income is not coerced to 0. */
export function buildScreeningDraft(idRaw: string, incomeRaw: string): ScreeningDraft {
  let idMessage: string | undefined
  let incomeMessage: string | undefined
  let idType: ScreeningIdType | undefined
  let idNumber = ''

  const idParsed = parseIdentityDocument(idRaw)
  if (idParsed.kind === 'empty') {
    idMessage = 'Enter an ID or passport number.'
  } else if (idParsed.kind === 'sa_id' && idParsed.valid === false) {
    idMessage = idParsed.error
  } else if (idParsed.kind === 'sa_id' && idParsed.valid) {
    idType = 'sa_id'
    idNumber = idParsed.normalized
  } else if (idParsed.kind === 'passport') {
    idType = 'passport'
    idNumber = idParsed.normalized
  }

  const income = parseZarToCents(incomeRaw)
  if (income.ok === false) incomeMessage = income.message

  if (idMessage || incomeMessage || !idType || income.ok === false) {
    return { ok: false, idMessage, incomeMessage }
  }

  return {
    ok: true,
    idType,
    idNumber,
    grossMonthlyIncomeCents: income.cents,
    incomeRands: randsFromCents(income.cents),
  }
}

export function centsFromDb(value: unknown): number | null {
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null
    return Number(value)
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const cents = BigInt(value)
    if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null
    return Number(cents)
  }
  return null
}

/** Row for `application_screening`, or null when the form has not supplied both fields. */
export function applicationScreeningRow(
  applicationId: string,
  data: Record<string, unknown>,
): ApplicationScreeningInsert | null {
  const cents = data.grossMonthlyIncomeCents
  const idType = data.idType
  const idNumber = typeof data.idNumberOrPassport === 'string' ? data.idNumberOrPassport.trim() : ''
  if (typeof cents !== 'number' || !Number.isInteger(cents) || cents < 0) return null
  if (idType !== 'sa_id' && idType !== 'passport') return null
  if (!idNumber) return null
  return {
    application_id: applicationId,
    id_type: idType,
    id_number: idNumber,
    gross_monthly_income_cents: cents,
  }
}
