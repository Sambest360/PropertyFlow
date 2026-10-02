import { describe, expect, it } from 'vitest'
import { buildIdMapCache, mapUser } from './idMap'

describe('mapUser hydrate (P0-5 residual)', () => {
  const cache = buildIdMapCache(
    [{ entity_type: 'user', backend_id: '11111111-1111-4111-8111-111111111111', frontend_id: 'u-fa-r14' }],
    [],
  )
  const userByUuid = new Map<string, string>([
    ['11111111-1111-4111-8111-111111111111', 'u-fa-r14'],
  ])

  it('hydrates mapped backend UUID to session FE id', () => {
    expect(mapUser(cache, userByUuid, '11111111-1111-4111-8111-111111111111')).toBe('u-fa-r14')
  })

  it('treats unmapped backend UUID as Unassigned (null)', () => {
    expect(mapUser(cache, userByUuid, '99999999-9999-4999-8999-999999999999')).toBe(null)
  })

  it('keeps frontend ids that are already FE-shaped', () => {
    expect(mapUser(cache, userByUuid, 'u-fa-r14')).toBe('u-fa-r14')
  })

  it('returns null for empty agent', () => {
    expect(mapUser(cache, userByUuid, null)).toBe(null)
    expect(mapUser(cache, userByUuid, undefined)).toBe(null)
  })
})
