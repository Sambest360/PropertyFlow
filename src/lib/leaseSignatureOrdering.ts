/**
 * Lease signing from the application workflow (AppStore
 * advanceApplicationWorkflow, TENANT_SIGNED / LANDLORD_SIGNED /
 * MARK_LEASE_SIGNED): the application may move to the signed status only
 * after the lease write carrying the signature has been saved. The server
 * accepts that move only for the status the stored lease envelope shows, so
 * an application write that lands first is refused and the application stays
 * at lease_sent.
 */
export const LEASE_SIGNATURE_NOT_RECORDED = 'LEASE_SIGNATURE_NOT_RECORDED' as const

export const LEASE_SIGNATURE_NOT_RECORDED_MESSAGE =
  "Your lease signature wasn't recorded yet, so your application wasn't moved to signed. " +
  'Refresh the page and sign the lease again. If it keeps happening, contact your agent.'

/** Staff / landlord wording: they record the signature, it is not "your application". */
export const LEASE_SIGNATURE_NOT_RECORDED_STAFF_MESSAGE =
  "The lease signature isn't recorded on the envelope yet, so the application wasn't moved. " +
  'Refresh the page and record the signature again; if it keeps failing, check the envelope status on the lease.'

export type LeaseSignatureAudience = 'applicant' | 'staff'

/** Applicant roles get the applicant wording; everyone else the staff wording. */
export function leaseSignatureAudienceForRole(role: string | null | undefined): LeaseSignatureAudience {
  return role === 'tenant' || role === 'contractor' ? 'applicant' : 'staff'
}

export function leaseSignatureNotRecordedMessage(audience: LeaseSignatureAudience): string {
  return audience === 'applicant' ? LEASE_SIGNATURE_NOT_RECORDED_MESSAGE : LEASE_SIGNATURE_NOT_RECORDED_STAFF_MESSAGE
}

export type LeaseSignatureNotRecorded = {
  code: typeof LEASE_SIGNATURE_NOT_RECORDED
  error: string
}

/**
 * Wait for the lease save (null: no signature in this step). Resolves to null
 * when the application write may go ahead, or the refusal to show otherwise.
 */
export async function leaseSignatureSaved(
  leaseSave: Promise<boolean> | null,
  audience: LeaseSignatureAudience = 'applicant',
): Promise<LeaseSignatureNotRecorded | null> {
  if (!leaseSave) return null
  const saved = await leaseSave.catch(() => false)
  return saved ? null : { code: LEASE_SIGNATURE_NOT_RECORDED, error: leaseSignatureNotRecordedMessage(audience) }
}

/**
 * CR10 fix 6: a workflow-modal sign on a lease with no envelope first issues
 * one through the existing issue path and waits for that save, so the sign
 * that follows is stamped by the server sign function. Resolves to the lease
 * with its envelope, or null (the sign is refused, the stage does not move).
 */
export async function ensureLeaseEnvelopeForSign<L extends { id: string; eSign?: { envelopeId?: string | null } | null }>(
  lease: L,
  deps: { issue: (lease: L) => Promise<L>; envelopeSave: (leaseId: string) => Promise<boolean> | undefined },
): Promise<L | null> {
  if (lease.eSign?.envelopeId) return lease
  const issued = await deps.issue(lease)
  if (!issued.eSign?.envelopeId) return null
  const saved = await Promise.resolve(deps.envelopeSave(issued.id) ?? true).catch(() => false)
  return saved ? issued : null
}
