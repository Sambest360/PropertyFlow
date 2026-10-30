/**
 * Screening consent wording shared by the apply flow and the API.
 * The server rebuilds the text from the version + check types + providers and
 * hashes that, so a client cannot record consent to wording it never saw.
 * Bump SCREENING_CONSENT_VERSION whenever the wording changes.
 */

export const SCREENING_CHECK_TYPES = ['ID_VERIFY', 'LIVENESS', 'BANK_AVS', 'CREDIT', 'RENTAL_HISTORY'] as const
export type ScreeningCheckType = (typeof SCREENING_CHECK_TYPES)[number]

export const SCREENING_CHECK_STATUSES = [
  'REQUESTED',
  'IN_PROGRESS',
  'PASSED',
  'FAILED',
  'REFER',
  'ERROR',
  'CANCELLED',
] as const
export type ScreeningCheckStatus = (typeof SCREENING_CHECK_STATUSES)[number]

export type ScreeningPayer = 'AGENCY' | 'APPLICANT'

export const SCREENING_CONSENT_VERSION = '2026-10-v1'
/** Consent older than this must be given again before a new check. */
export const SCREENING_CONSENT_VALID_DAYS = 90
export const DEFAULT_CREDIT_RETENTION_MONTHS = 12
export const ID_RETENTION_YEARS_AFTER_RELATIONSHIP = 5

/** ID-type checks (FICA record keeping): kept for 5 years after the relationship ends. */
export const ID_CHECK_TYPES: ReadonlySet<ScreeningCheckType> = new Set(['ID_VERIFY', 'LIVENESS', 'BANK_AVS'])

export const CHECK_TYPE_LABELS: Record<ScreeningCheckType, string> = {
  ID_VERIFY: 'Identity verification (Home Affairs)',
  LIVENESS: 'Selfie liveness check',
  BANK_AVS: 'Bank account verification',
  CREDIT: 'Credit report',
  RENTAL_HISTORY: 'Rental payment history',
}

export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  mock: 'Lekaya test provider (no real check)',
  tpn: 'TPN Credit Bureau',
  verifynow: 'VerifyNow',
  verifyid: 'VerifyID',
  deis: 'Deis bank verification',
}

export function providerDisplayName(id: string): string {
  return PROVIDER_DISPLAY_NAMES[id] ?? id
}

export function isScreeningCheckType(v: unknown): v is ScreeningCheckType {
  return typeof v === 'string' && (SCREENING_CHECK_TYPES as readonly string[]).includes(v)
}

export function retentionText(checkType: ScreeningCheckType, creditRetentionMonths: number): string {
  if (ID_CHECK_TYPES.has(checkType)) {
    return `${ID_RETENTION_YEARS_AFTER_RELATIONSHIP} years after your tenancy or business relationship with the agency ends`
  }
  return `${creditRetentionMonths} months after the check`
}

export const POPIA_RIGHTS_TEXT =
  'You may ask the agency what personal information it holds about you, ask for it to be corrected or deleted, ' +
  'object to processing, and withdraw this consent at any time (withdrawal does not undo checks already run). ' +
  'You may complain to the Information Regulator (inforegulator.org.za). The agency is responsible for these checks ' +
  'under FICA and POPIA; Lekaya processes the information on the agency’s behalf.'

export type ConsentTermsInput = {
  version: string
  agencyName: string
  checkTypes: readonly ScreeningCheckType[]
  /** Provider ids per check type, in the order they may be tried. */
  providers: Partial<Record<ScreeningCheckType, readonly string[]>>
  creditRetentionMonths: number
}

/** Canonical consent wording. Same input -> byte-identical text (it is hashed). */
export function buildConsentText(input: ConsentTermsInput): string {
  const lines = [
    `Screening consent (${input.version})`,
    `I authorise ${input.agencyName} to run the checks below on me for my rental application.`,
  ]
  for (const type of SCREENING_CHECK_TYPES) {
    if (!input.checkTypes.includes(type)) continue
    const names = (input.providers[type] ?? []).map(providerDisplayName).join(' or ')
    lines.push(
      `- ${CHECK_TYPE_LABELS[type]}${names ? ` via ${names}` : ''}; results kept ${retentionText(type, input.creditRetentionMonths)}.`,
    )
  }
  lines.push(`This consent is valid for ${SCREENING_CONSENT_VALID_DAYS} days.`)
  lines.push(POPIA_RIGHTS_TEXT)
  return lines.join('\n')
}

/**
 * Show only the last 4 characters of an ID / passport number, and only when
 * that is at most half of it (8+ characters). A shorter value shows its last
 * character (4-7 characters) or nothing (under 4), so a short ID never reveals
 * most of itself. Always at least four '•'.
 */
export function maskIdNumber(value: string | null | undefined): string {
  const v = (value ?? '').replace(/\s+/g, '')
  if (!v) return ''
  if (v.includes('\u2022')) return v // already masked
  const shown = v.length >= 8 ? 4 : v.length >= 4 ? 1 : 0
  return `${'•'.repeat(Math.max(v.length - shown, 4))}${shown ? v.slice(-shown) : ''}`
}

/** Mask from a stored last-4 value. */
export function maskLast4(last4: string | null | undefined): string {
  return last4 ? `•••• ${last4}` : ''
}

export function priceWithMarkup(costCents: number, markupBps: number): number {
  return Math.round((costCents * (10_000 + markupBps)) / 10_000)
}
