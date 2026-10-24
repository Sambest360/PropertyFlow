/**
 * CR9 — Propose payout on the trust payouts page.
 * Uses the existing store writer proposePayoutInstruction; no new writer or endpoint.
 * Rendered only for users who can already run payout actions (trust.approve_payout).
 */
import { useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import type { AppUser, PropertyAsset, Tenancy } from '../../types/domain'
import { labelOrReference } from '../../lib/displayIds'
import { Button, Input, Modal, Select } from '../ui'
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

  const close = () => {
    if (busy) return
    setOpen(false)
    setNote(null)
  }

  return (
    <div data-tip-target="trust-propose-payout" className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        className="min-h-11 gap-1.5"
        onClick={() => {
          setOpen(true)
          setNote(null)
        }}
      >
        <Send className="h-4 w-4" />
        Propose payout
      </Button>
      {note?.tone === 'ok' && !open ? (
        <p className="text-xs text-ink-600" role="status">
          {note.text}
        </p>
      ) : null}
      <Modal
        open={open}
        onClose={close}
        title="Propose payout"
        description="Propose a payout to a landlord for a tenancy. A second user must approve it."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void handlePropose()}>
              {busy ? 'Proposing…' : 'Propose payout'}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
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
          {landlordName && <p className="text-xs text-ink-400">Payee: {landlordName} (landlord)</p>}
          {note?.tone === 'error' ? (
            <p className="text-sm text-red-700" role="alert">
              {note.text}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
