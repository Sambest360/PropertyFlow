import { describe, expect, it } from 'vitest'
import { TRUST_MODE_A_COPY } from './modeA'
import { MESSAGING_MODE_A_SHORT, buildArrearsMessageThreadInput } from '../messaging/modeA'
import { TRUST_CSV_NON_PRODUCTION_LABEL } from './csvImport'
import { PAYOUT_LABELS, payoutStatusLabel } from './payoutLabels'

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
    const payoutStatuses = ['proposed', 'pending_approval', 'approved', 'submitted', 'settled', 'failed', 'cancelled']
    for (const text of [
      TRUST_MODE_A_COPY,
      MESSAGING_MODE_A_SHORT,
      msg.initialMessage,
      TRUST_CSV_NON_PRODUCTION_LABEL,
      ...Object.values(PAYOUT_LABELS),
      ...payoutStatuses.map(payoutStatusLabel),
    ]) {
      expect(text).not.toMatch(BANNED)
    }
    expect(msg.initialMessage).toContain('Outstanding: R1250.00.')
  })
})

describe('payout display labels (CR9 follow-up)', () => {
  it('shows the settled status value as completed without changing other statuses', () => {
    expect(payoutStatusLabel('settled')).toBe('completed')
    expect(payoutStatusLabel('pending_approval')).toBe('pending approval')
    expect(payoutStatusLabel('submitted')).toBe('submitted')
  })
})
