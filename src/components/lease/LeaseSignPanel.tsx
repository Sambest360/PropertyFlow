import { useEffect, useMemo } from 'react'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import type { Tenancy } from '../../types/domain'
import { SignaturePad } from '../workflow/SignaturePad'
import {
  isOnBehalf,
  onBehalfConfirmationText,
  signMethodFor,
  signaturePrefill,
  signerUserIdFor,
  type LeaseSignCapture,
  type SignParty,
} from '../../lib/lease/signaturePrefill'

/** Copy for the sign dialog (checked by the CR10 banned-words test). */
export const LEASE_SIGN_COPY = {
  onBehalfNote: (name: string) =>
    `You are signing for ${name}. Draw a new electronic signature; saved signatures are not used when signing for someone else.`,
  ownPrefilled: 'Your saved signature is filled in. Clear it to draw a new one.',
  staffOnTenant:
    'Only the tenant can sign the tenant part of the lease. For a paper lease, use Mark signed (paper) instead.',
  paperNote: 'Marks the paper lease as signed. No electronic signature is drawn; the record shows it was marked by staff.',
} as const

export type LeaseSignContext = {
  party: SignParty
  paper: boolean
  onBehalf: boolean
  onBehalfLandlord: boolean
  staffOnTenant: boolean
  signerName: string
}

/** Who is signing what, for the session user (shared by the dialog and the workflow modal). */
export function useLeaseSignContext(tenancy: Tenancy | null | undefined, party: SignParty, paper: boolean): LeaseSignContext & {
  prefill: string | null
} {
  const { user } = useAuth()
  const { state } = useStore()
  return useMemo(() => {
    const signerId = signerUserIdFor(tenancy, party)
    const me = state.users.find((u) => u.id === user.id)
    const onBehalf = isOnBehalf(user.id, signerId)
    const signerName =
      party === 'tenant'
        ? tenancy?.tenantName ?? 'Tenant'
        : state.users.find((u) => u.id === tenancy?.landlordId)?.name ?? 'Landlord'
    return {
      party,
      paper,
      onBehalf,
      onBehalfLandlord: onBehalf && party === 'landlord',
      staffOnTenant: onBehalf && party === 'tenant',
      signerName,
      prefill: paper ? null : signaturePrefill({ sessionUserId: user.id, sessionSignature: me?.signature, signerUserId: signerId }),
    }
  }, [tenancy, party, paper, state.users, user.id])
}

export function LeaseSignPanel({
  context,
  value,
  onChange,
}: {
  context: ReturnType<typeof useLeaseSignContext>
  value: LeaseSignCapture
  onChange: (next: LeaseSignCapture) => void
}) {
  const { prefill, paper } = context
  // Start from the own saved signature only when the rule allows it.
  useEffect(() => {
    if (paper) onChange({ method: 'paper_mark' })
    else if (prefill) onChange({ signatureDataUrl: prefill, method: 'saved_image' })
    else onChange({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, paper])

  const confirmText = onBehalfConfirmationText(context.signerName)

  if (context.staffOnTenant && !paper) {
    return <p className="rounded-xl bg-primary-50 px-3 py-2 text-sm text-ink-700">{LEASE_SIGN_COPY.staffOnTenant}</p>
  }

  return (
    <div className="space-y-3">
      {context.onBehalf && !paper ? (
        <p className="rounded-xl bg-primary-50 px-3 py-2 text-sm text-ink-700" data-testid="on-behalf-note">
          {LEASE_SIGN_COPY.onBehalfNote(context.signerName)}
        </p>
      ) : null}
      {prefill && !paper ? <p className="text-xs text-ink-500">{LEASE_SIGN_COPY.ownPrefilled}</p> : null}
      {paper ? (
        <p className="text-sm text-ink-600">{LEASE_SIGN_COPY.paperNote}</p>
      ) : (
        <SignaturePad
          value={prefill}
          onChange={(img) =>
            onChange({
              ...value,
              signatureDataUrl: img ?? undefined,
              method: signMethodFor({ image: img, prefill }),
            })
          }
        />
      )}
      {context.onBehalfLandlord ? (
        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={Boolean(value.onBehalfConfirmation)}
            onChange={(e) => onChange({ ...value, onBehalfConfirmation: e.target.checked ? confirmText : undefined })}
          />
          <span>{confirmText}</span>
        </label>
      ) : null}
    </div>
  )
}
