import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => vi.fn())
vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...a: unknown[]) => query(...a),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...a: unknown[]) => query(...a) },
}))

import { USER_TO_UUID } from './entityMap'
import { invalidateIdMapCache } from './idMapCache'

const SEED_FE = 'u-owner1'
const SEED_UUID = USER_TO_UUID[SEED_FE]
const SEED_EMAIL = 'trust@owners.co.za'
const SQUATTER = '99999999-8888-4777-8666-555555555555'
const row = (id: string, email: string) => ({
  id, email, first_name: 'T', last_name: 'L', phone: null, role: 'LANDLORD', active: true,
  client_id: null, metadata: null, agency_fe: null,
})

beforeEach(() => {
  invalidateIdMapCache()
  query.mockReset()
  // Empty entity_id_map: the seed row has no map entry.
  query.mockImplementation(async () => [])
})

describe('rowToSession seed round-trip (no email)', () => {
  it('an unmapped seed row gets its seed front-end id', async () => {
    const { rowToSession } = await import('./auth')
    const s = await rowToSession(row(SEED_UUID, SEED_EMAIL))
    expect(s.frontendId).toBe(SEED_FE)
  })

  it('a squatter with the seed email does not get the seed id', async () => {
    const { rowToSession } = await import('./auth')
    const s = await rowToSession(row(SQUATTER, SEED_EMAIL))
    expect(s.frontendId).toBe(SQUATTER)
  })
})

describe('bootstrap user labels', () => {
  it('a row owned by a squatter with the seed email is not labelled with the seed id', async () => {
    const { labelBootstrapUsers } = await import('./bootstrap')
    const labels = labelBootstrapUsers(
      [
        { id: SQUATTER, email: SEED_EMAIL.toUpperCase(), metadata: null },
        { id: SEED_UUID, email: 'other@x.test', metadata: null },
      ],
      new Map(),
    )
    expect(labels.get(SQUATTER)).toBe(SQUATTER)
    expect(labels.get(SEED_UUID)).toBe(SEED_FE)
  })
})
