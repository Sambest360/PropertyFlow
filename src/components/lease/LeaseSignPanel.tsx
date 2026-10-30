import { useEffect, useMemo, useState } from 'react'
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
import { ectaStatements, leaseContractText, sha256Hex } from '../../lib/lease/leaseContract'
import { LeaseContractView, useLeaseContract } from './LeaseDocument'

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

/**
 * ECTA 25 of 2002: before an electronic signature the signer reads the full
 * lease, ticks each "I agree" statement and types their name. The capture
 * carries the statements, the name and the fingerprint (SHA-256) of the
 * exact lease text shown; the server re-checks and records them.
 */
function EctaConsentBox({
  tenancy,
  signerName,
  onBehalf,
  onConsent,
}: {
  tenancy: Tenancy | null | undefined
  signerName: string
  onBehalf: boolean
  onConsent: (c: LeaseSignCapture['ectaConsent'] | undefined) => void
}) {
  const contract = useLeaseContract(tenancy)
  const [hash, setHash] = useState('')
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [typedName, setTypedName] = useState('')
  const [showLease, setShowLease] = useState(false)
  const statements = useMemo(() => ectaStatements(signerName, onBehalf), [signerName, onBehalf])

  useEffect(() => {
    if (!contract) return
    let live = true
    void sha256Hex(leaseContractText(contract)).then((h) => live && setHash(h)).catch(() => undefined)
    return () => {
      live = false
    }
  }, [contract])

  const complete = Boolean(hash && contract) && statements.every((s) => ticked[s.id]) && typedName.trim().split(/\s+/).length >= 2
  useEffect(() => {
    onConsent(
      complete && contract
        ? { statements: statements.map((s) => s.text), typedName: typedName.trim(), documentHash: hash, templateVersion: contract.version }
        : undefined,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, typedName, hash])

  return (
    <div className="space-y-3 rounded-xl border border-primary-100 p-3" data-tip-target="lease-consent">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Before you sign</p>
        <button type="button" className="cursor-pointer text-sm font-semibold text-primary hover:underline" onClick={() => setShowLease((v) => !v)}>
          {showLease ? 'Hide the lease' : 'Read the full lease'}
        </button>
      </div>
      {showLease && contract ? (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-primary-50 bg-white p-3">
          <LeaseContractView contract={contract} compact />
        </div>
      ) : null}
      {statements.map((s) => (
        <label key={s.id} className="flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" className="mt-1" checked={Boolean(ticked[s.id])} onChange={(e) => setTicked((t) => ({ ...t, [s.id]: e.target.checked }))} />
          <span>I agree: {s.text}</span>
        </label>
      ))}
      <label className="block text-sm">
        <span className="font-medium text-ink">Type your full name{onBehalf ? ' (the person signing)' : ''}</span>
        <input
          className="mt-1 block min-h-10 w-full rounded-xl border border-primary-100 px-3 text-sm"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder={onBehalf ? 'Your full name' : signerName}
          autoComplete="name"
        />
      </label>
      {hash ? <p className="break-all text-[11px] text-ink-400">Lease fingerprint {hash.slice(0, 24)}… — recorded with your signature, time and device.</p> : null}
    </div>
  )
}

export function LeaseSignPanel({
  context,
  value,
  onChange,
  tenancy,
}: {
  context: ReturnType<typeof useLeaseSignContext>
  value: LeaseSignCapture
  onChange: (next: LeaseSignCapture) => void
  /** The lease being signed (for the full text and its fingerprint). */
  tenancy?: Tenancy | null
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
      {!paper ? (
        <EctaConsentBox
          tenancy={tenancy}
          signerName={context.signerName}
          onBehalf={context.onBehalf}
          onConsent={(ectaConsent) => onChange({ ...value, ectaConsent })}
        />
      ) : null}
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
