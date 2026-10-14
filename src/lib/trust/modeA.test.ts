import { describe, expect, it } from 'vitest'
import { TRUST_MODE_A_COPY } from './modeA'
import { MESSAGING_MODE_A_SHORT, buildArrearsMessageThreadInput } from '../messaging/modeA'
import { TRUST_CSV_NON_PRODUCTION_LABEL } from './csvImport'
import { PAYOUT_LABELS, PAYOUT_MARKED_COMPLETE, payoutStatusLabel } from './payoutLabels'
import { OWNER_STATEMENT_MODE_A_COPY } from '../ownerStatement/types'
import { RENT_ROLL_MODE_A_COPY } from '../rentRoll/types'

const BANNED = /bank-reconciled|reconciled|ppra-compliant|compliant|settled|paid out|bank-confirmed|payprop|mode a|deposit interest/i

describe('Trust ledger note (CR9)', () => {
  it('is the single neutral ledger line', () => {
    expect(TRUST_MODE_A_COPY).toBe(
      'Balances come from the Letkaya ledger and are not yet matched to the bank.',
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
      OWNER_STATEMENT_MODE_A_COPY,
      RENT_ROLL_MODE_A_COPY,
      ...Object.values(PAYOUT_LABELS),
      ...payoutStatuses.map(payoutStatusLabel),
    ]) {
      // Jim's exact payout wording is the only allowed use of 'bank-confirmed'.
      expect(text.split(PAYOUT_MARKED_COMPLETE).join('')).not.toMatch(BANNED)
    }
    expect(msg.initialMessage).toContain('Outstanding: R1250.00.')
    // Owner statement / rent roll copy: core CR9 words (also in the stricter list above).
    const CORE_BANNED = /bank-reconciled|reconciled|ppra-compliant|compliant|settled|paid out|bank-confirmed/i
    for (const text of [OWNER_STATEMENT_MODE_A_COPY, RENT_ROLL_MODE_A_COPY]) {
      expect(text).not.toMatch(CORE_BANNED)
      expect(text).toContain('recorded in Letkaya, not yet matched to the bank')
    }
  })
})

describe('payout display labels (CR9 follow-up)', () => {
  it('shows the settled status value as marked complete without changing other statuses', () => {
    expect(PAYOUT_MARKED_COMPLETE).toBe('Marked complete (not bank-confirmed)')
    expect(payoutStatusLabel('settled')).toBe('Marked complete (not bank-confirmed)')
    expect(PAYOUT_LABELS.markedCompleteCard).not.toMatch(/this period/i)
    expect(Object.values(PAYOUT_LABELS).join(' ')).not.toMatch(/\bcompleted\b/i)
    expect(payoutStatusLabel('pending_approval')).toBe('pending approval')
    expect(payoutStatusLabel('submitted')).toBe('submitted')
  })
})
