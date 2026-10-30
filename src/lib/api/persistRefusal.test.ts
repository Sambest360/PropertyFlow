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

  it('ignores responses without a code, other statuses and non-JSON bodies', () => {
    expect(parsePersistRefusal(op, 403, JSON.stringify({ error: 'forbidden' }))).toBeNull()
    expect(parsePersistRefusal(op, 400, JSON.stringify({ error: 'bad' }))).toBeNull()
    expect(parsePersistRefusal(op, 500, JSON.stringify({ code: 'X' }))).toBeNull()
    expect(parsePersistRefusal(op, 403, '<html>')).toBeNull()
  })
})
