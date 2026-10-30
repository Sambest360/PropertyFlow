/**
 * The company behind lekayarentals.site, as named in the Privacy Policy and
 * Terms of Service (src/pages/legal). Fill these in before launch: a blank
 * field shows on those pages as "to be confirmed".
 */
export const LEGAL_ENTITY = {
  /** Trading name shown to users. */
  brand: 'Lekaya Rentals',
  /** Registered company name, e.g. "Lekaya Rentals (Pty) Ltd". */
  legalName: '',
  /** CIPC registration number. */
  registrationNumber: '',
  /** Physical / registered address. */
  address: '',
  /** POPIA Information Officer (name), registered with the Information Regulator. */
  informationOfficer: '',
  /** Where privacy requests and complaints go. */
  privacyEmail: '',
  /** General support address. */
  supportEmail: '',
  /**
   * Date these documents take effect (YYYY-MM-DD). Pending: the values PR sets it to the
   * publish date of the final reviewed text (Jim #118 C5). Blank shows "to be confirmed".
   * Not one of the gate's 6 required fields (Michael #118 ruling 5 keeps the spec's 6).
   */
  effectiveDate: '',
  website: 'https://lekayarentals.site',
} as const

export type LegalField = Exclude<keyof typeof LEGAL_ENTITY, 'website'>

/**
 * Every company detail the legal pages show with a "to be confirmed" marker
 * while blank (LegalPage.tsx Entity). supportEmail is shown on /terms.
 * brand and website always carry a value; effectiveDate is pending and shows a marker
 * but is not gated (see its comment).
 */
export const LEGAL_REQUIRED_FIELDS = [
  'legalName',
  'registrationNumber',
  'address',
  'informationOfficer',
  'privacyEmail',
  'supportEmail',
] as const satisfies readonly LegalField[]

export type RequiredLegalField = (typeof LEGAL_REQUIRED_FIELDS)[number]

export const EMAIL_FIELDS: ReadonlySet<string> = new Set(['privacyEmail', 'supportEmail'])

/**
 * Stand-in text someone might type instead of a real value. Counts as missing.
 * Includes N/A, NA, dashes, "none", "pending" and "not applicable" (Angela #118 C5).
 */
const PLACEHOLDER =
  /^\[.*\]$|\bto be confirmed\b|\btb[cd]\b|\btodo\b|placeholder|^e\.g\.|^x{3,}$|^n\/?a$|^[-\u2013\u2014\s]+$|^none$|\bpending\b|^not applicable$/i

/**
 * A sole proprietor has no CIPC number, so registrationNumber may say exactly
 * "not applicable" (Jim #118 C10). Nowhere else, and "N/A" is never accepted.
 */
const NOT_APPLICABLE = /^not applicable$/i
const NOT_APPLICABLE_FIELDS: ReadonlySet<string> = new Set(['registrationNumber'])

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** True when the value looks like a single email address (used for mailto: links too). */
export function isLegalEmail(value: string): boolean {
  return EMAIL.test(value.trim())
}

/**
 * True when a legal detail counts as filled in. The completeness check and the
 * pages' "to be confirmed" marker both use this, so they always agree (Angela #118 F7).
 */
export function legalValueFilled(field: string, raw: string | undefined): boolean {
  const value = raw?.trim() ?? ''
  if (!value) return false
  if (NOT_APPLICABLE_FIELDS.has(field) && NOT_APPLICABLE.test(value)) return true
  if (PLACEHOLDER.test(value)) return false
  if (EMAIL_FIELDS.has(field) && !isLegalEmail(value)) return false
  return true
}

/** The required company details that are blank, a placeholder, or (for emails) not an address. */
export function legalEntityMissing(entity: Record<string, string> = LEGAL_ENTITY): RequiredLegalField[] {
  return LEGAL_REQUIRED_FIELDS.filter((k) => !legalValueFilled(k, entity[k]))
}

/** True once every company detail the legal pages name has been filled in. */
export function legalEntityComplete(entity: Record<string, string> = LEGAL_ENTITY): boolean {
  return legalEntityMissing(entity).length === 0
}
