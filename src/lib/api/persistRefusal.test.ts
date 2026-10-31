import { describe, expect, it } from 'vitest'
import { parsePersistRefusal } from './persist'
import { persistRefusalMessage } from './persistRefusal'

/** Angela #80 (c3f25ac): a coded 403 from /api/persist is surfaced, never silent. */
describe('persist refusals', () => {
  const op = { resource: 'application', id: 'A-1', action: 'upsert' } as const

  it('parses a coded 403 into a refusal the store shows as a toast', () => {
    const r = parsePersistRefusal(op, 403, JSON.stringify({ error: 'forbidden', code: 'APPLICATION_TRANSITION_FORBIDDEN', message: 'Forbidden: x' }))
    expect(r).toEqual({ resource: 'application', id: 'A-1', action: 'upsert', status: 403, code: 'APPLICATION_TRANSITION_FORBIDDEN', message: 'Forbidden: x' })
    expect(persistRefusalMessage(r!)).toContain('handled by the agency')
    const locked = parsePersistRefusal(op, 403, JSON.stringify({ code: 'APPLICATION_FIELD_LOCKED' }))
    expect(persistRefusalMessage(locked!)).toContain('managed by the agency')
  })

  it('#83: a coded 400 is surfaced like 403 / 409', () => {
    const r = parsePersistRefusal({ resource: 'ticket', id: 'TK-1', action: 'upsert' }, 400, JSON.stringify({ code: 'TICKET_PRIORITY_INVALID', message: 'Bad request: x' }))
    expect(r).toMatchObject({ status: 400, code: 'TICKET_PRIORITY_INVALID' })
    expect(persistRefusalMessage(r!)).toContain("ticket wasn't saved")
    const asset = parsePersistRefusal({ resource: 'ticket', id: 'TK-1', action: 'upsert' }, 400, JSON.stringify({ code: 'TICKET_ASSET_NOT_ON_UNIT' }))
    expect(persistRefusalMessage(asset!)).toContain("isn't on your unit")
  })

  it('#83: the lease-signature refusal fits the role', () => {
    const r = { resource: 'application', id: 'A', action: 'upsert', status: 403, code: 'LEASE_SIGNATURE_NOT_RECORDED', message: '' }
    expect(persistRefusalMessage(r, 'tenant')).toMatch(/^Your lease signature wasn't recorded yet/)
    for (const role of ['client_admin', 'agent', 'landlord', null]) {
      expect(persistRefusalMessage(r, role)).toMatch(/^The lease signature isn't recorded on the envelope yet, so the application wasn't moved/)
    }
  })

  it('R7: event_log refusals are plain sentences, never the raw code, and surface as a toast', () => {
    for (const [status, code, text] of [
      [403, 'EVENT_LOG_TYPE_MISMATCH', "This record can't be changed from here."],
      [409, 'EVENT_LOG_ID_TAKEN', "This change wasn't saved because the record already exists."],
      [403, 'EVENT_LOG_AGENCY_MISMATCH', "This record belongs to another agency and can't be changed."],
    ] as const) {
      const r = parsePersistRefusal({ resource: 'activity', id: 'act-1', action: 'upsert' }, status, JSON.stringify({ error: 'persist_failed', code, message: 'Forbidden: x' }))
      expect(r).toMatchObject({ status, code })
      const msg = persistRefusalMessage(r!)
      expect(msg.startsWith(text)).toBe(true)
      expect(msg).not.toContain(code)
    }
  })

  it('Slice A: payment refusals are exact plain sentences, never a raw code', () => {
    const cases = [
      [409, 'PAYMENT_TERMINAL', "This payment is already marked paid and can't be edited here. Ask an admin to correct it."],
      [409, 'PAYMENT_CANCELLED', "This payment was cancelled and can't be edited here. Ask an admin to reopen it."],
      [400, 'PAYMENT_PAID_REFERENCE_REQUIRED', 'Add the EFT reference or a note (for cash, the receipt number) to mark this paid.'],
      [400, 'PAYMENT_AMOUNT_REQUIRED', 'This lease has no rent amount set.'],
      [403, 'PAYMENT_AGENCY_MISMATCH', "This payment belongs to another agency or property and can't be saved here. Your page has been refreshed."],
      [403, 'PAYMENT_APPLICATION_MISMATCH', "This payment doesn't match its application or lease. Your page has been refreshed."],
      [403, 'PAYMENT_PERMISSION_REQUIRED', "You don't have permission to change payments. Ask an agency admin."],
      [400, 'PAYMENT_AMOUNT_REASON_REQUIRED', 'Give a reason for changing the amount, then save again.'],
      [403, 'PAYMENT_PARTY_MISMATCH', "The payer isn't a tenant or applicant of this agency. Pick the payer again."],
      [409, 'PAYMENT_AMOUNT_MISMATCH', "This payment's amount doesn't match what is due. Your page has been refreshed."],
      [409, 'PAYMENT_ENTRY_EXISTS', 'This payment has already been added for this application. Your page has been refreshed.'],
      [409, 'ENTRY_AMOUNT_UNKNOWN', "The amount due for this application isn't set yet. Ask an agency admin."],
    ] as const
    for (const [status, code, text] of cases) {
      const r = parsePersistRefusal({ resource: 'payment', id: 'PAY-1', action: 'upsert' }, status, JSON.stringify({ error: 'persist_failed', code, message: 'x' }))
      expect(r).toMatchObject({ status, code })
      const msg = persistRefusalMessage(r!)
      expect(msg).toBe(text)
      expect(msg).not.toMatch(/[A-Z_]{6,}/)
    }
  })

  it('ignores responses without a code, other statuses and non-JSON bodies', () => {
    expect(parsePersistRefusal(op, 403, JSON.stringify({ error: 'forbidden' }))).toBeNull()
    expect(parsePersistRefusal(op, 400, JSON.stringify({ error: 'bad' }))).toBeNull()
    expect(parsePersistRefusal(op, 500, JSON.stringify({ code: 'X' }))).toBeNull()
    expect(parsePersistRefusal(op, 403, '<html>')).toBeNull()
  })
})
