import { describe, expect, it } from 'vitest'
import { TRUST_MODE_A_COPY } from './modeA'
import { MESSAGING_MODE_A_SHORT, buildArrearsMessageThreadInput } from '../messaging/modeA'

const BANNED = /bank-reconciled|reconciled|ppra-compliant|compliant|settled|paid out|bank-confirmed|payprop|mode a|deposit interest/i

describe('Trust ledger note (CR9)', () => {
  it('is the single neutral ledger line', () => {
    expect(TRUST_MODE_A_COPY).toBe(
      'Balances come from the PropertyFlow ledger and are not yet matched to the bank.',
    )
  })

  it('touched trust and arrears-message labels avoid banned words', () => {
    const msg = buildArrearsMessageThreadInput({
      agencyId: 'ag',
      propertyId: null,
      applicationId: null,
      occupancyId: 'OC-1',
      staffUserId: 'u-staff',
      tenantUserId: 'u-tenant',
      landlordId: null,
      totalCents: 125000,
    })
    for (const text of [TRUST_MODE_A_COPY, MESSAGING_MODE_A_SHORT, msg.initialMessage]) {
      expect(text).not.toMatch(BANNED)
    }
    expect(msg.initialMessage).toContain('Outstanding: R1250.00.')
  })
})
