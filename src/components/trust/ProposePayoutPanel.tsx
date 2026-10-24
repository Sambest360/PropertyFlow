/**
 * CR9 — Propose payout on the trust payouts page.
 * Uses the existing store writer proposePayoutInstruction; no new writer or endpoint.
 * Rendered only for users who can already run payout actions (trust.approve_payout).
 */
import { useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import type { AppUser, PropertyAsset, Tenancy } from '../../types/domain'
import { labelOrReference } from '../../lib/displayIds'
import { Button, Card, Input, Select } from '../ui'
import { personRefLabel } from '../../lib/propertyRefs'

/** Params accepted by the store's proposePayoutInstruction. */
export type ProposePayoutParams = {
  agencyId: string
  actorUserId: string
  occupancyId?: string | null
  propertyId: string
  payeeType?: string
  payeeId: string
  bankAccountId?: string
  amountCents: number
  bucketCode?: string
  idempotencyKey?: string
}

export type ProposePayoutFn = (
  params: ProposePayoutParams,
) => Promise<{ ok: boolean; error?: string; instructionId?: string }>

/** Build the payout for a tenancy: owner payable to the tenancy's landlord. */
export function buildProposePayoutParams(input: {
  tenancy: Pick<Tenancy, 'id' | 'agencyId' | 'propertyId' | 'landlordId'>
  amountZar: string | number
  actorUserId: string
}): { ok: true; params: ProposePayoutParams } | { ok: false; error: string } {
  const amount = typeof input.amountZar === 'number' ? input.amountZar : Number(String(input.amountZar).trim())
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Enter an amount greater than zero' }
  if (!input.tenancy.landlordId) return { ok: false, error: 'This tenancy has no landlord to pay' }
  if (!input.actorUserId) return { ok: false, error: 'Sign in to propose a payout' }
  return {
    ok: true,
    params: {
      agencyId: input.tenancy.agencyId,
      actorUserId: input.actorUserId,
      occupancyId: input.tenancy.id,
      propertyId: input.tenancy.propertyId,
      payeeType: 'landlord',
      payeeId: input.tenancy.landlordId,
      amountCents: Math.round(amount * 100),
      bucketCode: 'owner_payable',
    },
  }
}

/** Click handler body: validate, then call proposePayoutInstruction once. */
export async function proposePayoutFromForm(
  propose: ProposePayoutFn,
  input: Parameters<typeof buildProposePayoutParams>[0],
): Promise<{ ok: boolean; error?: string; instructionId?: string }> {
  const built = buildProposePayoutParams(input)
  if (built.ok === false) return { ok: false, error: built.error }
  return propose(built.params)
}

export const PROPOSE_PAYOUT_OK_TEXT = 'Payout proposed. A second user must approve it.'

/** Note shown after a propose attempt. Success text only when the save succeeded (ok true). */
export function proposeResultNote(result: { ok: boolean; error?: string }): { tone: 'ok' | 'error'; text: string } {
  if (result.ok === true) return { tone: 'ok', text: PROPOSE_PAYOUT_OK_TEXT }
  return { tone: 'error', text: result.error || 'Could not propose payout' }
}

export function ProposePayoutPanel(props: {
  canPropose: boolean
  actorUserId: string | null | undefined
  agencyId: string | null | undefined
  tenancies: readonly Tenancy[]
  properties: readonly PropertyAsset[]
  users: readonly AppUser[]
  propose: ProposePayoutFn
}) {
  const { canPropose, actorUserId, agencyId, tenancies, properties, users, propose } = props
  const [open, setOpen] = useState(false)
  const [tenancyId, setTenancyId] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const options = useMemo(
    () => tenancies.filter((t) => (!agencyId || t.agencyId === agencyId) && t.landlordId),
    [tenancies, agencyId],
  )

  if (!canPropose || !actorUserId) return null

  const selected = options.find((t) => t.id === tenancyId) ?? null
  const landlordName = selected ? (users.find((u) => u.id === selected.landlordId)?.name ?? personRefLabel(selected.landlordId)) : null

  async function handlePropose() {
    if (!selected || !actorUserId) {
      setNote({ tone: 'error', text: 'Choose a tenancy' })
      return
    }
    setBusy(true)
    try {
      const result = await proposePayoutFromForm(propose, { tenancy: selected, amountZar: amount, actorUserId })
      setNote(proposeResultNote(result))
      if (result.ok === true) {
        setAmount('')
        setTenancyId('')
        setOpen(false)
      }
    } catch {
      setNote(proposeResultNote({ ok: false }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-tip-target="trust-propose-payout">
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-500">Propose a payout to a landlord for a tenancy.</p>
        {!open && (
          <Button variant="primary" size="sm" onClick={() => { setOpen(true); setNote(null) }}>
            <Send className="h-4 w-4" />
            Propose payout
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm text-ink-600">
            Tenancy
            <Select value={tenancyId} onChange={(e) => setTenancyId(e.target.value)}>
              <option value="">Choose a tenancy</option>
              {options.map((t) => {
                const title = labelOrReference(
                  properties.find((p) => p.id === t.propertyId)?.title,
                  t.propertyId,
                  'Property',
                )
                return (
                  <option key={t.id} value={t.id}>
                    {t.tenantName} · {title}
                  </option>
                )
              })}
            </Select>
          </label>
          <label className="grid gap-1 text-sm text-ink-600">
            Amount (ZAR)
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={() => void handlePropose()}>
              Propose payout
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {landlordName && <p className="text-xs text-ink-400 sm:col-span-3">Payee: {landlordName} (landlord)</p>}
        </div>
      )}
      {note && (
        <p className={`mt-2 text-sm ${note.tone === 'ok' ? 'text-ink-600' : 'text-red-700'}`} role="status">
          {note.text}
        </p>
      )}
    </Card>
    </div>
  )
}
