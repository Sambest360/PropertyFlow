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

  it('ignores responses without a code, other statuses and non-JSON bodies', () => {
    expect(parsePersistRefusal(op, 403, JSON.stringify({ error: 'forbidden' }))).toBeNull()
    expect(parsePersistRefusal(op, 500, JSON.stringify({ code: 'X' }))).toBeNull()
    expect(parsePersistRefusal(op, 403, '<html>')).toBeNull()
  })
})
