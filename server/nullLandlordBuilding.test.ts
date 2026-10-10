import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
vi.mock('./db.js', () => ({ query: (...a: unknown[]) => query(...a) }))

import { USER_TO_UUID } from './entityMap'
import { invalidateIdMapCache } from './idMapCache'
import { buildActorPropertyScope } from './scopeGate'
import { buildPropertyScope } from '../src/lib/scope'

const OWNER1_UUID = USER_TO_UUID['u-owner1']
const UNIT = '11111111-2222-4333-8444-555555555555'
const CLIENT = '22222222-3333-4444-8555-666666666666'

beforeEach(() => {
  invalidateIdMapCache()
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/SELECT entity_type, frontend_id, backend_id::text FROM entity_id_map/.test(sql)) {
      return [
        { entity_type: 'user', frontend_id: 'u-owner1', backend_id: OWNER1_UUID },
        { entity_type: 'agency', frontend_id: 'ag-a', backend_id: CLIENT },
      ]
    }
    if (/FROM units u/.test(sql) && /JOIN buildings b/.test(sql)) {
      return [{ unit_id: UNIT, client_id: CLIENT, agent_id: null, landlord_id: null }]
    }
    return []
  })
})

describe('scopeGate: landlord-less building', () => {
  it('a building with null landlord_id is not in u-owner1 allowedPropertyIds', async () => {
    const scope = await buildActorPropertyScope({ userId: 'u-owner1', role: 'landlord', agencyId: 'ag-a' })
    expect(scope.allowedPropertyIds.has(UNIT)).toBe(false)
    expect(scope.allowedPropertyIds.size).toBe(0)
  })

  it('staff still list it; no landlord sees it (client scope)', () => {
    const properties = [{ id: 'p-orphan', agencyId: 'ag-a', agentId: null, landlordId: null as unknown as string }]
    const staff = buildPropertyScope({ role: 'client_admin', userId: 'u-admin', agencyId: 'ag-a', agencySuspended: false }, { properties })
    expect(staff.allowedPropertyIds.has('p-orphan')).toBe(true)
    for (const userId of ['u-owner1', 'u-johan']) {
      const ll = buildPropertyScope({ role: 'landlord', userId, agencyId: 'ag-a', agencySuspended: false }, { properties })
      expect(ll.allowedPropertyIds.has('p-orphan')).toBe(false)
    }
  })
})
