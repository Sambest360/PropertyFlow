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
): Promise<LeaseSignatureNotRecorded | null> {
  if (!leaseSave) return null
  const saved = await leaseSave.catch(() => false)
  return saved ? null : { code: LEASE_SIGNATURE_NOT_RECORDED, error: LEASE_SIGNATURE_NOT_RECORDED_MESSAGE }
}
