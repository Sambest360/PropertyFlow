/**
 * South African ID (13 digits) helpers — DOB from YYMMDD + Luhn-style checksum.
 * Non-13-digit values are treated as passport / other ID (no DOB derivation).
 */

export type SaIdParseResult =
  | {
      kind: 'sa_id'
      valid: true
      normalized: string
      dateOfBirth: string // YYYY-MM-DD
      gender: 'female' | 'male'
      citizen: boolean
    }
  | {
      kind: 'sa_id'
      valid: false
      normalized: string
      error: string
    }
  | {
      kind: 'passport'
      valid: true
      normalized: string
    }
  | {
      kind: 'empty'
      valid: true
      normalized: ''
    }

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

/** Luhn-style check used by SA ID numbers. */
export function saIdChecksumValid(id13: string): boolean {
  if (!/^\d{13}$/.test(id13)) return false
  let sum = 0
  for (let i = 0; i < 13; i++) {
    let d = Number(id13[i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

/**
 * Resolve century for YYMMDD so DOB is not in the future and age is plausible.
 */
export function dobFromSaIdYymmdd(yymmdd: string, now = new Date()): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null
  const yy = Number(yymmdd.slice(0, 2))
  const mm = Number(yymmdd.slice(2, 4))
  const dd = Number(yymmdd.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null

  let year = Math.floor(now.getFullYear() / 100) * 100 + yy
  if (year > now.getFullYear()) year -= 100
  if (now.getFullYear() - year > 120) year -= 100

  const candidate = new Date(year, mm - 1, dd)
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== mm - 1 ||
    candidate.getDate() !== dd
  ) {
    return null
  }
  if (candidate.getTime() > now.getTime()) return null

  const y = String(year)
  const m = String(mm).padStart(2, '0')
  const d = String(dd).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseIdentityDocument(raw: string): SaIdParseResult {
  const trimmed = raw.trim()
  if (!trimmed) return { kind: 'empty', valid: true, normalized: '' }

  const digits = digitsOnly(trimmed)

  // Looks like SA ID (exactly 13 digits, ignoring spaces/dashes)
  if (digits.length === 13 && /^\d{13}$/.test(digits)) {
    const dob = dobFromSaIdYymmdd(digits.slice(0, 6))
    if (!dob) {
      return {
        kind: 'sa_id',
        valid: false,
        normalized: digits,
        error: 'ID number has an invalid date of birth.',
      }
    }
    if (!saIdChecksumValid(digits)) {
      return {
        kind: 'sa_id',
        valid: false,
        normalized: digits,
        error: 'ID number failed the checksum check. Check the digits.',
      }
    }
    const seq = Number(digits.slice(6, 10))
    return {
      kind: 'sa_id',
      valid: true,
      normalized: digits,
      dateOfBirth: dob,
      gender: seq >= 5000 ? 'male' : 'female',
      citizen: digits[10] === '0',
    }
  }

  // Partial numeric entry that looks like an incomplete SA ID
  if (/^\d[\d\s-]*$/.test(trimmed) && digits.length > 0 && digits.length !== 13) {
    return {
      kind: 'sa_id',
      valid: false,
      normalized: digits,
      error: 'South African ID numbers are 13 digits.',
    }
  }

  // Passport / other — keep as entered (uppercased alphanumerics)
  const passport = trimmed.replace(/\s+/g, '').toUpperCase()
  if (passport.length < 5) {
    return {
      kind: 'sa_id',
      valid: false,
      normalized: passport,
      error: 'Enter a 13-digit SA ID or a passport number (at least 5 characters).',
    }
  }

  return { kind: 'passport', valid: true, normalized: passport }
}

export function formatDisplayDob(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
