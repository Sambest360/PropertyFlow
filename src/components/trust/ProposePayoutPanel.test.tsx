import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Tenancy } from '../../types/domain'
import { rolePermissions } from '../../lib/permissions'
import { ProposePayoutPanel, buildProposePayoutParams, proposePayoutFromForm } from './ProposePayoutPanel'

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
