/**
 * Parse a rand amount typed by a person into integer cents.
 * Spaces are thousands separators. A comma or a point is the decimal separator.
 * The conversion uses digit strings and BigInt — never binary floating point.
 */

export type ZarToCentsResult =
  | { ok: true; cents: number }
  | { ok: false; message: string }

const EXAMPLE = '12 345,67'

export function parseZarToCents(raw: string): ZarToCentsResult {
  if (raw == null || raw.trim() === '') {
    return { ok: false, message: 'Enter a monthly income.' }
  }

  if (raw.includes('-')) {
    return { ok: false, message: 'Income cannot be negative.' }
  }

  let s = raw.trim().replace(/\s+/g, '')
  s = s.replace(/^R/i, '')

  if (!s) {
    return { ok: false, message: 'Enter a monthly income.' }
  }

  if (s.startsWith('-')) {
    return { ok: false, message: 'Income cannot be negative.' }
  }

  if (/^\d+[.,]\d{3,}$/.test(s)) {
    return { ok: false, message: 'Income can have at most two decimal places.' }
  }

  if (!/^\d+([.,]\d{1,2})?$/.test(s)) {
    return {
      ok: false,
      message: `Enter income in rands, for example ${EXAMPLE}.`,
    }
  }

  const sepAt = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'))
  const whole = sepAt === -1 ? s : s.slice(0, sepAt)
  const frac = sepAt === -1 ? '' : s.slice(sepAt + 1)
  const centsDigits = `${whole}${frac.padEnd(2, '0')}`

  let cents: bigint
  try {
    cents = BigInt(centsDigits)
  } catch {
    return { ok: false, message: `Enter income in rands, for example ${EXAMPLE}.` }
  }

  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, message: 'Income is too large.' }
  }

  return { ok: true, cents: Number(cents) }
}

/** Whole rands from integer cents. Truncates the cents remainder. */
export function randsFromCents(cents: number): number {
  return Number(BigInt(cents) / 100n)
}

/** Editable rand string, using a space for thousands and a comma for cents. */
export function centsToZarInput(cents: number): string {
  const value = BigInt(cents)
  const whole = value / 100n
  const frac = value % 100n
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  if (frac === 0n) return grouped
  return `${grouped},${String(frac).padStart(2, '0')}`
}

/** Display rands from integer cents, for example R12 345,67. */
export function formatCentsAsZar(cents: number): string {
  const value = BigInt(cents)
  const negative = value < 0n
  const abs = negative ? -value : value
  const whole = abs / 100n
  const frac = abs % 100n
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${negative ? '-' : ''}R${grouped},${String(frac).padStart(2, '0')}`
}
