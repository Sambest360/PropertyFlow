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

describe('seed-email squatter after the linkUserFeToUuid agency-check removal (#86)', () => {
  it('session: squatter with seed email and seed id in entity_id_map still gets its own uuid', async () => {
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/SELECT frontend_id FROM entity_id_map/.test(sql)) return params?.[0] === SEED_UUID ? [{ frontend_id: SEED_FE }] : []
      if (/SELECT entity_type, frontend_id, backend_id::text FROM entity_id_map/.test(sql))
        return [{ entity_type: 'user', frontend_id: SEED_FE, backend_id: SEED_UUID }]
      return []
    })
    const { rowToSession } = await import('./auth')
    expect((await rowToSession(row(SQUATTER, SEED_EMAIL.toUpperCase()))).frontendId).toBe(SQUATTER)
    expect((await rowToSession(row(SEED_UUID, SEED_EMAIL))).frontendId).toBe(SEED_FE)
  })

  it('bootstrap: squatter with seed email is not labelled with the seed id when the cache maps the seed', async () => {
    const { labelBootstrapUsers } = await import('./bootstrap')
    const labels = labelBootstrapUsers(
      [
        { id: SQUATTER, email: SEED_EMAIL, metadata: null },
        { id: SEED_UUID, email: SEED_EMAIL, metadata: null },
      ],
      new Map([[SEED_UUID, SEED_FE]]),
    )
    expect(labels.get(SQUATTER)).toBe(SQUATTER)
    expect(labels.get(SEED_UUID)).toBe(SEED_FE)
  })
})
