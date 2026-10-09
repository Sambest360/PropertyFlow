import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Tenancy } from '../../types/domain'
import { rolePermissions } from '../../lib/permissions'
import type { PayoutInstruction } from '../../types/domain'
import { PROPOSE_PAYOUT_SAVE_FAILED, commitProposedPayout } from '../../lib/trust/proposePayoutCommit'
import {
  PROPOSE_PAYOUT_OK_TEXT,
  ProposePayoutPanel,
  buildProposePayoutParams,
  proposePayoutFromForm,
  proposeResultNote,
} from './ProposePayoutPanel'

const tenancy = {
  id: 'TN-7',
  agencyId: 'ag-1',
  propertyId: 'p-7',
  landlordId: 'u-landlord',
  tenantName: 'Sipho',
} as Tenancy

describe('CR9 Propose payout button', () => {
  it('calls proposePayoutInstruction once with the payout for the chosen tenancy', async () => {
    const propose = vi.fn().mockResolvedValue({ ok: true, instructionId: 'pi-1' })
    const result = await proposePayoutFromForm(propose, { tenancy, amountZar: '1234.56', actorUserId: 'u-staff' })
    expect(result).toEqual({ ok: true, instructionId: 'pi-1' })
    expect(propose).toHaveBeenCalledTimes(1)
    expect(propose).toHaveBeenCalledWith({
      agencyId: 'ag-1',
      actorUserId: 'u-staff',
      occupancyId: 'TN-7',
      propertyId: 'p-7',
      payeeType: 'landlord',
      payeeId: 'u-landlord',
      amountCents: 123456,
      bucketCode: 'owner_payable',
    })
  })

  it('does not call the writer for a zero or blank amount', async () => {
    const propose = vi.fn()
    for (const amountZar of ['', '0', '-5', 'abc']) {
      const r = await proposePayoutFromForm(propose, { tenancy, amountZar, actorUserId: 'u-staff' })
      expect(r.ok).toBe(false)
    }
    expect(propose).not.toHaveBeenCalled()
    expect(buildProposePayoutParams({ tenancy: { ...tenancy, landlordId: '' }, amountZar: 10, actorUserId: 'u' }).ok).toBe(false)
  })

  it('shows the button only to users who can run payout actions', () => {
    const props = {
      actorUserId: 'u-staff',
      agencyId: 'ag-1',
      tenancies: [tenancy],
      properties: [],
      users: [],
      propose: vi.fn(),
    }
    expect(renderToStaticMarkup(<ProposePayoutPanel {...props} canPropose />)).toContain('Propose payout')
    expect(renderToStaticMarkup(<ProposePayoutPanel {...props} canPropose={false} />)).toBe('')
    // Same permission as the payouts route; landlord, tenant and field agents lack it.
    expect(rolePermissions.agent_admin).toContain('trust.approve_payout')
    expect(rolePermissions.landlord).not.toContain('trust.approve_payout')
    expect(rolePermissions.ground_agent).not.toContain('trust.approve_payout')
  })

  it('payouts page wires the panel to the existing store writer and permission', () => {
    const src = readFileSync(resolve(__dirname, '../../pages/trust/TrustPayouts.tsx'), 'utf8')
    expect(src).toMatch(/propose=\{proposePayoutInstruction\}/)
    expect(src).toMatch(/canPropose=\{has\('trust\.approve_payout'\)\}/)
  })

  it('labels never use forbidden words', () => {
    const src = readFileSync(resolve(__dirname, './ProposePayoutPanel.tsx'), 'utf8')
    const markup = renderToStaticMarkup(
      <ProposePayoutPanel canPropose actorUserId="u" agencyId="ag-1" tenancies={[tenancy]} properties={[]} users={[]} propose={vi.fn()} />,
    )
    for (const text of [markup, src.replace(/\/\*\*[\s\S]*?\*\//g, '')]) {
      expect(text).not.toMatch(/settled|paid out|bank-confirmed|reconciled|compliant|PayProp/i)
    }
  })
})

describe('CR9 Propose payout: failed save is never shown as success', () => {
  const row = { id: 'pi-new', amountCents: 5000, agencyId: 'ag-1' } as PayoutInstruction
  const existing = { id: 'pi-old', amountCents: 100, agencyId: 'ag-1' } as PayoutInstruction

  function harness() {
    let state = { payoutInstructions: [existing] }
    const seen: string[][] = []
    const patch = (fn: (s: typeof state) => typeof state) => {
      state = fn(state)
      seen.push(state.payoutInstructions.map((p) => p.id))
    }
    return { patch, seen, get: () => state }
  }

  it('a failed save returns ok false and removes the optimistic row', async () => {
    const h = harness()
    const persist = vi.fn().mockResolvedValue(false)
    const result = await commitProposedPayout({ row, patch: h.patch, persist })
    expect(persist).toHaveBeenCalledWith(row)
    expect(result).toEqual({ ok: false, error: PROPOSE_PAYOUT_SAVE_FAILED })
    // Added optimistically, then removed.
    expect(h.seen[0]).toEqual(['pi-new', 'pi-old'])
    expect(h.get().payoutInstructions.map((p) => p.id)).toEqual(['pi-old'])
  })

  it('a save that throws is treated as failed and removes the row', async () => {
    const h = harness()
    const result = await commitProposedPayout({ row, patch: h.patch, persist: vi.fn().mockRejectedValue(new Error('net')) })
    expect(result.ok).toBe(false)
    expect(h.get().payoutInstructions.map((p) => p.id)).toEqual(['pi-old'])
  })

  it('a successful save keeps the row and returns ok true', async () => {
    const h = harness()
    const result = await commitProposedPayout({ row, patch: h.patch, persist: vi.fn().mockResolvedValue(true) })
    expect(result).toEqual({ ok: true, instructionId: 'pi-new' })
    expect(h.get().payoutInstructions.map((p) => p.id)).toEqual(['pi-new', 'pi-old'])
  })

  it('the panel shows the failure, not the success text, on ok false', async () => {
    const propose = vi.fn().mockResolvedValue({ ok: false, error: PROPOSE_PAYOUT_SAVE_FAILED })
    const result = await proposePayoutFromForm(propose, { tenancy, amountZar: '50', actorUserId: 'u-staff' })
    const note = proposeResultNote(result)
    expect(note).toEqual({ tone: 'error', text: PROPOSE_PAYOUT_SAVE_FAILED })
    expect(note.text).not.toBe(PROPOSE_PAYOUT_OK_TEXT)
    expect(proposeResultNote({ ok: false }).tone).toBe('error')
    expect(proposeResultNote({ ok: true }).text).toBe(PROPOSE_PAYOUT_OK_TEXT)
  })

  it('the store writer awaits the save and returns ok false before logging activity', () => {
    const src = readFileSync(resolve(__dirname, '../../context/AppStore.tsx'), 'utf8')
    const start = src.indexOf('const proposePayoutInstruction = useCallback(')
    const body = src.slice(start, src.indexOf('const approvePayoutInstruction', start))
    expect(body).toMatch(/await commitProposedPayout\(/)
    expect(body).toMatch(/if \(committed\.ok === false\) return \{ ok: false/)
    expect(body.indexOf('committed.ok === false')).toBeLessThan(body.indexOf('addActivity('))
  })
})
