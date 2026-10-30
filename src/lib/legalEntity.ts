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
  /** Date these documents took effect (YYYY-MM-DD). */
  effectiveDate: '2026-10-30',
  website: 'https://lekayarentals.site',
} as const

export type LegalField = Exclude<keyof typeof LEGAL_ENTITY, 'website'>

/**
 * Every company detail the legal pages show with a "to be confirmed" marker
 * while blank (LegalPage.tsx Entity). supportEmail is shown on /terms.
 * brand, effectiveDate and website always carry a value and are not checked.
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

/** Stand-in text someone might type instead of a real value. Counts as missing. */
const PLACEHOLDER = /^\[.*\]$|\bto be confirmed\b|\btb[cd]\b|\btodo\b|placeholder|^e\.g\.|^x{3,}$/i

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** True when the value looks like a single email address (used for mailto: links too). */
export function isLegalEmail(value: string): boolean {
  return EMAIL.test(value.trim())
}

function fieldFilled(field: string, raw: string | undefined): boolean {
  const value = raw?.trim() ?? ''
  if (!value || PLACEHOLDER.test(value)) return false
  if (EMAIL_FIELDS.has(field) && !isLegalEmail(value)) return false
  return true
}

/** The required company details that are blank, a placeholder, or (for emails) not an address. */
export function legalEntityMissing(entity: Record<string, string> = LEGAL_ENTITY): RequiredLegalField[] {
  return LEGAL_REQUIRED_FIELDS.filter((k) => !fieldFilled(k, entity[k]))
}

/** True once every company detail the legal pages name has been filled in. */
export function legalEntityComplete(entity: Record<string, string> = LEGAL_ENTITY): boolean {
  return legalEntityMissing(entity).length === 0
}
