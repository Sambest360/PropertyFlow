import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
vi.mock('./db.js', () => ({ query: (...a: unknown[]) => query(...a) }))

import { USER_TO_UUID } from './entityMap'
import { invalidateIdMapCache, loadIdMapCache, feUserFromCache } from './idMapCache'
import { actorIdAliases, filterBootstrapForActor } from './scopeGate'
import { buildPropertyScope } from '../src/lib/scope'

const SEED_FE = 'u-owner1'
const SEED_UUID = USER_TO_UUID[SEED_FE]
const SQUATTER = '99999999-8888-4777-8666-555555555555'
const at = '2026-09-15T10:00:00.000Z'

beforeEach(() => {
  invalidateIdMapCache()
  query.mockReset()
  query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (/SELECT entity_type, frontend_id, backend_id::text FROM entity_id_map/.test(sql)) {
      return [{ entity_type: 'user', frontend_id: SEED_FE, backend_id: SEED_UUID }]
    }
    if (/FROM users/.test(sql) && /email/.test(sql)) {
      return [
        { id: SEED_UUID, email: 'trust@owners.co.za' },
        // Squatter registered with the seed landlord's email (new uuid).
        { id: SQUATTER, email: 'TRUST@owners.co.za' },
      ]
    }
    if (/SELECT frontend_id FROM entity_id_map/.test(sql)) {
      return params?.[0] === SEED_UUID ? [{ frontend_id: SEED_FE }] : []
    }
    if (/SELECT backend_id::text FROM entity_id_map/.test(sql)) return []
    return []
  })
})

describe('seed-email squatter', () => {
  it('idMapCache does not hand the seed front-end id to a squatter uuid', async () => {
    const cache = await loadIdMapCache(true)
    expect(feUserFromCache(cache, SEED_UUID)).toBe(SEED_FE)
    expect(feUserFromCache(cache, SQUATTER)).toBe(SQUATTER)
  })

  it('a landlord with a seed landlord email gets none of its trust rows or payouts', async () => {
    const actor = { userId: SQUATTER, role: 'landlord' as const, agencyId: 'ag-a' }
    const aliases = await actorIdAliases(actor)
    expect([...aliases]).not.toContain(SEED_FE)
    const raw = {
      source: 'test', fetchedAt: at, agencies: [{ id: 'ag-a' }], users: [], buildings: [], units: [],
      properties: [{ id: 'p-seed', agencyId: 'ag-a', landlordId: SEED_FE }],
      leads: [], applications: [], viewings: [], viewingSlots: [], payments: [], propertyDocuments: [],
      tickets: [], threads: [], messages: [], notifications: [],
      tenancies: [{ id: 'ten-seed', agencyId: 'ag-a', propertyId: 'p-seed', landlordId: SEED_FE }],
      trustAllocations: [{ id: 'al-seed', agencyId: 'ag-a', occupancyId: 'ten-seed', amountCents: 1, allocatedAt: at }],
      payoutInstructions: [{ id: 'po-seed', agencyId: 'ag-a', propertyId: 'p-seed', payeeType: 'landlord', payeeId: SEED_FE, bankAccountId: 'ba-seed', status: 'approved', amountCents: 1 }],
    }
    const scope = buildPropertyScope(
      { role: 'landlord', userId: SQUATTER, agencyId: 'ag-a', agencySuspended: false },
      { properties: raw.properties },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = filterBootstrapForActor(raw as any, actor, scope, aliases)
    expect(out.trustAllocations).toEqual([])
    expect(out.payoutInstructions).toEqual([])
  })

  it('the real seed landlord still gets its rows', async () => {
    const aliases = await actorIdAliases({ userId: SEED_UUID, role: 'landlord', agencyId: 'ag-a' })
    expect([...aliases]).toEqual(expect.arrayContaining([SEED_UUID, SEED_FE]))
  })
})
