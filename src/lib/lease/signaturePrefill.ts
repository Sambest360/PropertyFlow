/**
 * CR10 sign rules on the client (the server re-checks every one of them in
 * server/leaseSign.ts). Pure helpers, unit-tested.
 */
export type SignMethod = 'drawn' | 'saved_image' | 'paper_mark'
export type SignParty = 'tenant' | 'landlord'

export const SIGN_METHOD_LABELS: Record<SignMethod, string> = {
  drawn: 'Drawn electronic signature',
  saved_image: 'Saved electronic signature',
  paper_mark: 'Paper (marked signed)',
}

/** The mandate line staff tick before signing for a landlord. */
export function onBehalfConfirmationText(landlordName: string): string {
  return `I am signing for ${landlordName} under the agency's mandate.`
}

/** Who signs a block: the lease's tenant user, or its landlord. */
export function signerUserIdFor(
  tenancy: { tenantUserId?: string | null; landlordId?: string | null } | null | undefined,
  party: SignParty,
): string | null {
  if (!tenancy) return null
  const id = party === 'tenant' ? tenancy.tenantUserId : tenancy.landlordId
  return id ? String(id) : null
}

/** Signing on behalf: the session user is not the block's signer (or either id is missing). */
export function isOnBehalf(sessionUserId: string | null | undefined, signerUserId: string | null | undefined): boolean {
  if (!sessionUserId || !signerUserId) return true
  return sessionUserId !== signerUserId
}

/**
 * Prefill: only the session user's own saved signature, and only when the
 * session user is the signer of that block. Otherwise the pad starts empty.
 */
export function signaturePrefill(input: {
  sessionUserId: string | null | undefined
  sessionSignature: string | null | undefined
  signerUserId: string | null | undefined
}): string | null {
  if (isOnBehalf(input.sessionUserId, input.signerUserId)) return null
  return input.sessionSignature || null
}

/** Method sent to the server: unchanged prefill = saved image; anything drawn = drawn. */
export function signMethodFor(input: { paper?: boolean; image?: string | null; prefill?: string | null }): SignMethod {
  if (input.paper) return 'paper_mark'
  if (input.image && input.prefill && input.image === input.prefill) return 'saved_image'
  return 'drawn'
}

export type LeaseSignCapture = {
  signatureDataUrl?: string
  method?: SignMethod
  onBehalfConfirmation?: string
  /** ECTA 25 of 2002: "I agree" statements, typed name and lease fingerprint. */
  ectaConsent?: import('./types').EctaConsent
}

/** Client-side check before Sign is allowed (null = ok). */
export function leaseSignCaptureError(
  capture: LeaseSignCapture,
  opts: { paper?: boolean; onBehalfLandlord?: boolean; staffOnTenant?: boolean },
): string | null {
  if (opts.staffOnTenant && !opts.paper) return 'Only the tenant can sign the tenant part of the lease.'
  if (opts.onBehalfLandlord && !capture.onBehalfConfirmation) {
    return "Tick the confirmation that you are signing under the agency's mandate."
  }
  if (opts.paper) return null
  if (!capture.ectaConsent) return 'Read the lease, tick each "I agree" statement and type your full name.'
  if (!capture.signatureDataUrl) return 'Draw a signature before continuing.'
  return null
}
