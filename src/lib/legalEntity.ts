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

/** True once every company detail the legal pages name has been filled in. */
export function legalEntityComplete(entity: Record<string, string> = LEGAL_ENTITY): boolean {
  return ['legalName', 'registrationNumber', 'address', 'informationOfficer', 'privacyEmail'].every(
    (k) => Boolean(entity[k]?.trim()),
  )
}
