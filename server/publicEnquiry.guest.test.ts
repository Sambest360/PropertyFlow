import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Register interest on PR-1011. query() returns a row array, not { rows }.
 * Destructuring { rows } made rows undefined and rows[0] threw
 * "Cannot read properties of undefined (reading '0')".
 * ensureEntityMapTable is real, so the Framesby seed row is in the map.
 */
const db = vi.hoisted(() => ({
  mapRows: [] as Array<{ entity_type: string; frontend_id: string; backend_id: string }>,
  units: new Map<
    string,
    {
      id: string
      client_id: string | null
      building_id: string
      agent_id: string | null
      status_config_key: string
      price: string | null
      rent: string | null
      unit_number?: string
      title?: string
    }
  >(),
  buildings: new Map<string, { id: string; client_id: string | null; suburb?: string }>(),
}))

const query = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

const FRAMESBY_UNIT = 'a4000001-0001-4000-8000-000000000008'
const BAYVIEW_CLIENT = 'a1000001-0001-4000-8000-000000000003'
const BAYVIEW_BUILDING = 'a3000001-0001-4000-8000-000000000007'
const LIVE_UNIT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const LIVE_BUILDING = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const HORIZON_CLIENT = 'a1000001-0001-4000-8000-000000000001'

function rememberMapRow(entityType: string, frontendId: string, backendId: string, update: boolean) {
  const sameFe = db.mapRows.find((r) => r.entity_type === entityType && r.frontend_id === frontendId)
  if (sameFe) {
    if (update) sameFe.backend_id = backendId
    return
  }
  const sameBe = db.mapRows.find((r) => r.entity_type === entityType && r.backend_id === backendId)
  if (sameBe) return
  db.mapRows.push({ entity_type: entityType, frontend_id: frontendId, backend_id: backendId })
}

describe('guest register-interest on PR-1011', () => {
  beforeEach(() => {
    db.mapRows = []
    db.units = new Map([
      [
        FRAMESBY_UNIT,
        {
          id: FRAMESBY_UNIT,
          client_id: BAYVIEW_CLIENT,
          building_id: BAYVIEW_BUILDING,
          agent_id: null,
          status_config_key: 'OCCUPIED',
          price: '2150000',
          rent: '14500',
          unit_number: 'MAIN',
          title: 'Framesby cottage — Protea Lane',
        },
      ],
      [
        LIVE_UNIT,
        {
          id: LIVE_UNIT,
          client_id: HORIZON_CLIENT,
          building_id: LIVE_BUILDING,
          agent_id: null,
          status_config_key: 'AVAILABLE',
          price: null,
          rent: '11800',
          unit_number: 'B14',
          title: 'Humewood Beach Apartment B14',
        },
      ],
    ])
    db.buildings = new Map([
      [BAYVIEW_BUILDING, { id: BAYVIEW_BUILDING, client_id: BAYVIEW_CLIENT, suburb: 'Framesby' }],
      [LIVE_BUILDING, { id: LIVE_BUILDING, client_id: HORIZON_CLIENT, suburb: 'Humewood' }],
    ])
    query.mockReset()
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('CREATE TABLE') || sql.includes('CREATE UNIQUE')) return []
      if (sql.includes('INSERT INTO entity_id_map')) {
        const update = /DO UPDATE/i.test(sql)
        const values = params ?? []
        for (let i = 0; i + 2 < values.length; i += 3) {
          rememberMapRow(String(values[i]), String(values[i + 1]), String(values[i + 2]), update)
        }
        return []
      }
      if (sql.includes('NOT (u.id = ANY') && sql.includes('Humewood')) {
        const seedIds = new Set((params?.[0] as string[]) ?? [])
        return [...db.units.values()]
          .filter((unit) => !seedIds.has(unit.id) && (unit.title ?? '').includes('Humewood Beach Apartment B14'))
          .map((unit) => ({
            id: unit.id,
            backend_id: unit.id,
            unit_client: unit.client_id,
            building_client: db.buildings.get(unit.building_id)?.client_id ?? null,
          }))
      }
      if (sql.includes('entity_id_map') && sql.includes('JOIN units')) {
        const types = (params?.[0] as string[]) ?? []
        const fes = (params?.[1] as string[]) ?? []
        const matched = db.mapRows.filter(
          (r) => types.includes(r.entity_type) && fes.includes(r.frontend_id) && db.units.has(r.backend_id),
        )
        matched.sort((a, b) => Number(b.backend_id === FRAMESBY_UNIT) - Number(a.backend_id === FRAMESBY_UNIT))
        return matched.map((r) => {
          const unit = db.units.get(r.backend_id)!
          const building = db.buildings.get(unit.building_id)
          return {
            id: unit.id,
            backend_id: r.backend_id,
            unit_client: unit.client_id,
            building_client: building?.client_id ?? null,
          }
        })
      }
      if (sql.includes('FROM entity_id_map')) {
        const types = (params?.[0] as string[]) ?? []
        const fes = (params?.[1] as string[]) ?? []
        const matched = db.mapRows.filter((r) => types.includes(r.entity_type) && fes.includes(r.frontend_id))
        const limited = /LIMIT\s+1/i.test(sql) ? matched.slice(0, 1) : matched
        return limited.map((r) => ({ backend_id: r.backend_id, frontend_id: r.frontend_id }))
      }
      if (sql.includes('FROM units WHERE id')) {
        const id = String(params?.[0] ?? '')
        const unit = db.units.get(id)
        // Array, not { rows }. The old destructure read [0] off undefined.
        if (!unit) return []
        return [
          {
            id: unit.id,
            client_id: unit.client_id,
            agent_id: unit.agent_id,
            status_config_key: unit.status_config_key,
            price: unit.price,
            rent: unit.rent,
          },
        ]
      }
      if (sql.includes('INSERT INTO leads')) return []
      throw new Error(`unexpected sql: ${sql.slice(0, 180)}`)
    })
  })

  it('saves the enquiry on Humewood instead of throwing reading 0', async () => {
    const { ensureEntityMapTable } = await import('./entityMap.js')
    await ensureEntityMapTable()
    const { submitPublicListingEnquiry } = await import('./publicEnquiry.js')
    let caught: unknown
    let result: Awaited<ReturnType<typeof submitPublicListingEnquiry>> | undefined
    try {
      result = await submitPublicListingEnquiry({
        propertyId: 'PR-1011',
        action: 'lead',
        firstName: 'Naledi',
        lastName: 'Dlamini',
        email: 'naledi.dlamini.d03@gmail.com',
        interestType: 'Rent',
      })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeUndefined()
    expect(String((caught as Error | undefined)?.message ?? '')).not.toMatch(/reading '0'/)
    expect(result?.ok).toBe(true)
    expect(result?.unitId).toBe(LIVE_UNIT)
    expect(result?.unitId).not.toBe(FRAMESBY_UNIT)

    const framesbySeed = db.mapRows.find(
      (r) => r.frontend_id === 'unt-PR-1011' && r.backend_id === FRAMESBY_UNIT,
    )
    expect(framesbySeed).toBeTruthy()

    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO leads'))
    expect(insert).toBeTruthy()
    const params = insert![1] as unknown[]
    expect(params[1]).toBe(HORIZON_CLIENT)
    expect(params[1]).not.toBe(BAYVIEW_CLIENT)
    expect(params[2]).toBe(LIVE_UNIT)
    expect(params[2]).not.toBe(FRAMESBY_UNIT)
  })
})
