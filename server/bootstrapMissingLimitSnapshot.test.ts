import { describe, expect, it, vi } from 'vitest'

/**
 * A self-hosted database without migration 024 has no
 * unit_listing_limit_snapshot(). Once the first unit existed, every bootstrap
 * and the public marketplace answered 500 (guests saw "Listings temporarily
 * unavailable"). Listings now load without the limit badges; any other
 * database error still fails the bootstrap.
 */
const C21 = 'f2a29694-8440-4dab-93a7-ed1bb917b2c5'
const BLD = '7d1c6a52-6f0e-4b8e-9a51-2f3b0c6d9e11'
const UNIT = '3b9f2e44-1c7a-4d2e-8f60-5a4b3c2d1e0f'
let snapshotError: { code: string; message: string } = {
  code: '42883',
  message: 'function unit_listing_limit_snapshot(uuid) does not exist',
}

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(async (sql: string) => {
    if (/unit_listing_limit_snapshot/.test(sql)) {
      throw Object.assign(new Error(snapshotError.message), { code: snapshotError.code })
    }
    if (/FROM clients/.test(sql)) {
      return [{ id: C21, company_name: 'century 21', subdomain: 'century-21', status: 'active', city: 'Gqeberha', created_at: new Date('2026-10-15'), settings: {} }]
    }
    if (/FROM buildings/.test(sql)) {
      return [{ id: BLD, client_id: C21, landlord_id: null, name: 'Sea View', address: '1 Beach Rd', city: 'Gqeberha', province: null, suburb: 'Summerstrand', images: [], created_at: new Date('2026-10-20') }]
    }
    if (/FROM units/.test(sql)) {
      return [{ id: UNIT, building_id: BLD, client_id: C21, unit_number: '1', listing_type: 'rent', rent: '9500', status_config_key: 'PUBLISHED', agent_id: null, title: 'Sea View 1', amenities: [], images: [], featured: false, created_at: new Date('2026-10-26'), updated_at: new Date('2026-10-26') }]
    }
    if (/FROM entity_id_map/.test(sql)) return [{ entity_type: 'agency', frontend_id: 'ag-14gu4m', backend_id: C21 }]
    return []
  }),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}))

describe('bootstrap on a database without unit_listing_limit_snapshot()', () => {
  it('still loads the units, with one warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { buildBootstrap } = await import('./bootstrap.js')
    for (const lite of [true, false, true]) {
      const data = (await buildBootstrap({ lite })) as Record<string, unknown>
      expect((data.units as unknown[]).length).toBe(1)
      expect((data.properties as unknown[]).length).toBe(1)
    }
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('unit_listing_limit_snapshot'))).toHaveLength(1)
    warn.mockRestore()
  })

  it('still fails on any other database error', async () => {
    const { buildBootstrap } = await import('./bootstrap.js')
    snapshotError = { code: '08006', message: 'connection reset' }
    await expect(buildBootstrap({ lite: true })).rejects.toThrow('connection reset')
  })
})
