import { describe, expect, it } from 'vitest'

/**
 * Admin reversal Step 1, unit part (spec-admin-reversal.md v1.3; delta D4
 * rows 1-6). Pure helpers of server/paymentReversal.ts; no database.
 */
const load = () => import('./paymentReversal.js')
const RID = '7b0c8e7e-4d1a-4c55-9e57-1f0a3c2b9d10'
const body = (over: Record<string, unknown> = {}) => ({
  reasonKind: 'WRONG_ROW',
  reason: 'Recorded on the wrong tenant row',
  expectedUpdatedAt: '2026-10-30T08:00:00.000Z',
  requestId: RID,
  ...over,
})
const codeOf = async (fn: () => unknown) => {
  try {
    await fn()
    return null
  } catch (e) {
    return { status: (e as { status?: number }).status, code: (e as { code?: string }).code }
  }
}

describe('T-V4 reason and reason kind (row 1)', () => {
  it('missing reason, a 9-character reason and an unknown kind give the exact 400 codes; 10 characters pass', async () => {
    const { parseReversalBody } = await load()
    expect(await codeOf(() => parseReversalBody('reverse', body({ reason: undefined }), false))).toEqual({ status: 400, code: 'PAYMENT_REVERSAL_REASON_REQUIRED' })
    expect(await codeOf(() => parseReversalBody('reverse', body({ reason: '123456789' }), false))).toEqual({ status: 400, code: 'PAYMENT_REVERSAL_REASON_REQUIRED' })
    expect(await codeOf(() => parseReversalBody('reverse', body({ reason: '   12345678   ' }), false))).toEqual({ status: 400, code: 'PAYMENT_REVERSAL_REASON_REQUIRED' })
    expect(await codeOf(() => parseReversalBody('reverse', body({ reasonKind: 'TYPO' }), false))).toEqual({ status: 400, code: 'PAYMENT_REVERSAL_REASON_KIND_INVALID' })
    // A reopen kind is not a reverse kind, and the other way round.
    expect(await codeOf(() => parseReversalBody('reverse', body({ reasonKind: 'STILL_OWED' }), false))).toEqual({ status: 400, code: 'PAYMENT_REVERSAL_REASON_KIND_INVALID' })
    expect(await codeOf(() => parseReversalBody('reopen', body({ reasonKind: 'PAYMENT_BOUNCED' }), false))).toEqual({ status: 400, code: 'PAYMENT_REVERSAL_REASON_KIND_INVALID' })
    expect(await codeOf(() => parseReversalBody('reverse', body({ reason: '1234567890' }), false))).toBeNull()
    expect(await codeOf(() => parseReversalBody('reverse', body({ reason: 'x'.repeat(501) }), false))).toEqual({ status: 400, code: 'PAYMENT_REVERSAL_REASON_REQUIRED' })
  })

  it('line breaks collapse to spaces before the length check', async () => {
    const { normaliseReason } = await load()
    expect(normaliseReason('Wrong row\r\nfor unit 4')).toBe('Wrong row for unit 4')
  })
})

describe('T-V3a support ticket reference (row 2)', () => {
  it('missing, `abcd`, `  ab  ` and 121 characters after trim give 400 TICKET_REQUIRED; `T-123`, free text and 120 characters pass', async () => {
    const { parseReversalBody } = await load()
    const ticket = (t: unknown) => codeOf(() => parseReversalBody('reverse', body({ supportTicketRef: t }), true))
    const refused = { status: 400, code: 'PAYMENT_REVERSAL_TICKET_REQUIRED' }
    expect(await ticket(undefined)).toEqual(refused)
    expect(await ticket('abcd')).toEqual(refused)
    expect(await ticket('  ab  ')).toEqual(refused)
    expect(await ticket(`  ${'t'.repeat(121)}  `)).toEqual(refused)
    expect(await ticket('T-123')).toBeNull()
    expect(await ticket('ticket from Sipho re Unit 4')).toBeNull()
    expect(await ticket(`  ${'t'.repeat(120)}  `)).toBeNull()
  })

  it('break-glass stores the reason as `[Support <ref>] <reason>`; a non-break-glass ticket is ignored', async () => {
    const { parseReversalBody } = await load()
    expect(parseReversalBody('reverse', body({ supportTicketRef: ' T-123 ' }), true).storedReason).toBe('[Support T-123] Recorded on the wrong tenant row')
    const plain = parseReversalBody('reverse', body({ supportTicketRef: 'T-123' }), false)
    expect({ ref: plain.supportTicketRef, stored: plain.storedReason }).toEqual({ ref: null, stored: 'Recorded on the wrong tenant row' })
  })
})

describe('T-V26 earlier month in SAST (row 3, unit part)', () => {
  it('a payment received 30 Sep 23:30 UTC (1 Oct 01:30 SAST) is the same month as 15 Oct: no acknowledgement', async () => {
    const { isEarlierMonthSast } = await load()
    const now = new Date('2026-10-15T10:00:00Z')
    expect(isEarlierMonthSast(new Date('2026-09-30T23:30:00Z'), now)).toBe(false)
    expect(isEarlierMonthSast(new Date('2026-09-30T21:00:00Z'), now)).toBe(true) // 23:00 SAST on 30 Sep
    expect(isEarlierMonthSast(new Date('2026-10-02T08:00:00Z'), now)).toBe(false)
    expect(isEarlierMonthSast(null, now)).toBe(false)
  })

  it('31 Oct 22:30 UTC is already November in SAST: a payment received 31 Oct 10:00 SAST is then an earlier month', async () => {
    const { isEarlierMonthSast } = await load()
    expect(isEarlierMonthSast(new Date('2026-10-31T08:00:00Z'), new Date('2026-10-31T22:30:00Z'))).toBe(true)
  })

  it('reopen never takes the acknowledgement from the body', async () => {
    const { parseReversalBody } = await load()
    expect(parseReversalBody('reopen', body({ reasonKind: 'STILL_OWED', acknowledgeEarlierMonth: true }), false).acknowledgeEarlierMonth).toBe(false)
  })
})

describe('T-V15a notice texts (row 4)', () => {
  const facts = { paymentType: 'RENT', amount: 8500, dueDate: '2026-09-01' }
  it('PAYMENT_BOUNCED gives the exact bank sentence; other kinds the corrected sentence; reopen its own', async () => {
    const { tenantNoticeText } = await load()
    expect(tenantNoticeText('reverse', 'PAYMENT_BOUNCED', facts)).toEqual({
      title: 'Payment returned',
      body: 'The payment of R 8500.00 was returned by the bank. Please pay again and upload your proof.',
    })
    expect(tenantNoticeText('reverse', 'WRONG_ROW', facts)).toEqual({
      title: 'Payment record corrected',
      body: 'Your agency corrected the record of your rent payment. It now shows as due. If you have already paid, upload your proof of payment or contact your agency.',
    })
    expect(tenantNoticeText('reopen', 'STILL_OWED', facts)).toEqual({
      title: 'Payment reopened',
      body: 'Your agency reopened your rent payment of R 8500.00 due on 2026-09-01. Please pay the agency, then upload your proof of payment.',
    })
  })

  it('no tenant or admin text carries the free-text reason (the helpers do not even take it)', async () => {
    const { tenantNoticeText, adminNoticeText } = await load()
    expect(tenantNoticeText.length).toBe(3)
    const admin = adminNoticeText('reverse', 'NOT_RECEIVED', { ...facts, actorName: 'Lerato Nkosi', label: 'Unit 4' })
    expect(admin).toEqual({
      title: 'Payment record changed',
      body: 'Lerato Nkosi reversed the rent payment of R 8500.00 (due 2026-09-01) for Unit 4: Money not received.',
    })
  })
})

describe('card guard on reason and ticket (row 5): arrives with Step 2', () => {
  it.todo('a reason containing a card number (Luhn-valid 13-19 digits) gives 400 PAYMENT_CARD_NUMBER_REFUSED (Step 2, after A2)')
  it.todo('a support ticket reference containing a card number gives 400 PAYMENT_CARD_NUMBER_REFUSED (Step 2, after A2)')
})

describe('T-V11 STORED reference (row 6, unit part)', () => {
  it('clearReference is false unless the body says true; the audit keeps the last 4 characters only', async () => {
    const { parseReversalBody, referenceLast4 } = await load()
    expect(parseReversalBody('reverse', body(), false).clearReference).toBe(false)
    expect(parseReversalBody('reverse', body({ clearReference: 'yes' }), false).clearReference).toBe(false)
    expect(parseReversalBody('reverse', body({ clearReference: true }), false).clearReference).toBe(true)
    expect(referenceLast4('FNB-REF-0042-7781')).toBe('7781')
    expect(referenceLast4(null)).toBeNull()
  })
})

describe('audit allow-lists (condition E)', () => {
  it('reverse: extra keys are dropped, impersonatedUserId is kept, impersonatorUserId is not on the list (Slice A defines no such field)', async () => {
    const { allowListPayload, REVERSE_PAYLOAD_KEYS } = await load()
    const full = Object.fromEntries(REVERSE_PAYLOAD_KEYS.required.map((k) => [k, k === 'restoredAmountCents' ? null : 'x']))
    const out = allowListPayload(REVERSE_PAYLOAD_KEYS, {
      ...full,
      impersonatedUserId: 'par-client-admin',
      impersonatorUserId: 'par-super',
      reference: 'FULL-REFERENCE-1234',
      partyName: 'Thandi',
    })
    expect(Object.keys(out).sort()).toEqual([...REVERSE_PAYLOAD_KEYS.required, 'impersonatedUserId'].sort())
    expect(out).not.toHaveProperty('impersonatorUserId')
    expect(out).not.toHaveProperty('reference')
  })

  it('reopen: the exact key set; a missing required key throws', async () => {
    const { allowListPayload, REOPEN_PAYLOAD_KEYS } = await load()
    expect([...REOPEN_PAYLOAD_KEYS.required].sort()).toEqual(
      ['actorRole', 'adminsNotified', 'amountCents', 'cancelledEventId', 'dueDate', 'newStatus', 'previousStatus', 'reason', 'reasonKind', 'requestId', 'tenantNotified'],
    )
    expect([...REOPEN_PAYLOAD_KEYS.optional].sort()).toEqual(['impersonatedUserId', 'supportTicketRef'])
    expect(() => allowListPayload(REOPEN_PAYLOAD_KEYS, { previousStatus: 'CANCELLED' })).toThrow(/audit key/)
  })
})

describe('rule 1 roles (T-V2a-c, unit part)', () => {
  it('only client_admin, agent_admin and super_admin may reverse or reopen', async () => {
    const { reversalRoleAllowed } = await load()
    const roles = ['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent', 'landlord', 'tenant', 'contractor'] as const
    expect(roles.filter((r) => reversalRoleAllowed(r))).toEqual(['super_admin', 'client_admin', 'agent_admin'])
  })
})
