import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENCY_TO_CLIENT, mapProperty } from './idMap.js'
import { PUBLIC_HUMEWOOD_UNIT_ID } from './listingResolve.js'
import { buildPropertyScope, dealInScope } from '../src/lib/scope.js'

/**
 * In-memory entity_id_map + units. ensureEntityMapTable is the real function
 * (not stubbed), so the static Framesby seed pair is inserted into this map
 * the same way production does. The join returns that seed row first.
 */
const db = vi.hoisted(() => ({
  mapRows: [] as Array<{ entity_type: string; frontend_id: string; backend_id: string }>,
  units: new Map<string, { id: string; client_id: string | null; building_id: string; unit_number?: string; title?: string }>(),
  buildings: new Map<string, { id: string; client_id: string | null; suburb?: string }>(),
  applications: new Map<string, { id: string; client_id: string; unit_id: string; reference_code: string }>(),
}))

const query = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

/** Static seed: PR-1011 → Framesby cottage, Bayview client on the building. */
const FRAMESBY_UNIT = 'a4000001-0001-4000-8000-000000000008'
const BAYVIEW_CLIENT = 'a1000001-0001-4000-8000-000000000003'
const BAYVIEW_BUILDING = 'a3000001-0001-4000-8000-000000000007'
/** Live Humewood Beach Apartment, Horizon client. */
const LIVE_UNIT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const LIVE_BUILDING = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const HORIZON_CLIENT = 'a1000001-0001-4000-8000-000000000001'

function rememberMapRow(entityType: string, frontendId: string, backendId: string, update: boolean) {
  const sameFe = db.mapRows.find(
    (r) => r.entity_type === entityType && r.frontend_id === frontendId,
  )
  if (sameFe) {
    if (update) sameFe.backend_id = backendId
    return
  }
  const sameBe = db.mapRows.find(
    (r) => r.entity_type === entityType && r.backend_id === backendId,
  )
  if (sameBe) return
  db.mapRows.push({ entity_type: entityType, frontend_id: frontendId, backend_id: backendId })
}

describe('guest public apply inherits listing agency (PR-1011)', () => {
  beforeEach(() => {
    db.mapRows = [
      // Live Humewood already owns property/PR-1011. Seed insert must not replace it.
      { entity_type: 'property', frontend_id: 'PR-1011', backend_id: LIVE_UNIT },
    ]
    db.units = new Map([
      [LIVE_UNIT, { id: LIVE_UNIT, client_id: HORIZON_CLIENT, building_id: LIVE_BUILDING }],
      // seed.sql: Framesby unit client is Bayview, same as the building. Do not null it.
      [FRAMESBY_UNIT, { id: FRAMESBY_UNIT, client_id: BAYVIEW_CLIENT, building_id: BAYVIEW_BUILDING }],
    ])
    db.buildings = new Map([
      [LIVE_BUILDING, { id: LIVE_BUILDING, client_id: HORIZON_CLIENT }],
      [BAYVIEW_BUILDING, { id: BAYVIEW_BUILDING, client_id: BAYVIEW_CLIENT }],
    ])
    db.applications = new Map()
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

      if (sql.includes('NOT (u.id = ANY') && sql.includes('Humewood Beach Apartment B14')) {
        const seedIds = new Set((params?.[0] as string[]) ?? [])
        const matched = [...db.units.values()].filter((unit) => {
          if (seedIds.has(unit.id)) return false
          const title = unit.title ?? ''
          return title.includes('Humewood Beach Apartment B14') && !title.includes('Beachview')
        })
        return matched.map((unit) => {
          const building = db.buildings.get(unit.building_id)
          return {
            id: unit.id,
            backend_id: unit.id,
            unit_client: unit.client_id,
            building_client: building?.client_id ?? null,
          }
        })
      }

      if (sql.includes('entity_id_map') && sql.includes('JOIN units')) {
        const types = (params?.[0] as string[]) ?? []
        const fes = (params?.[1] as string[]) ?? []
        const matched = db.mapRows.filter(
          (r) => types.includes(r.entity_type) && fes.includes(r.frontend_id) && db.units.has(r.backend_id),
        )
        // Framesby first — LIMIT 1 / rows[0] would pick the seed.
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
        const matched = db.mapRows.filter(
          (r) => types.includes(r.entity_type) && fes.includes(r.frontend_id),
        )
        matched.sort((a, b) => Number(b.backend_id === FRAMESBY_UNIT) - Number(a.backend_id === FRAMESBY_UNIT))
        const limited = /LIMIT\s+1/i.test(sql) ? matched.slice(0, 1) : matched
        return limited.map((r) => ({ backend_id: r.backend_id, frontend_id: r.frontend_id }))
      }

      if (sql.includes('FROM users') || sql.includes('FROM clients')) return []
      if (sql.includes('INSERT INTO buildings')) {
        const vals = params ?? []
        db.buildings.set(String(vals[0]), {
          id: String(vals[0]),
          client_id: vals[1] == null ? null : String(vals[1]),
          suburb: vals[6] == null ? undefined : String(vals[6]),
        })
        return []
      }
      if (sql.includes('INSERT INTO units')) {
        const vals = params ?? []
        const id = String(vals[0])
        db.units.set(id, {
          id,
          client_id: vals[2] == null ? null : String(vals[2]),
          building_id: String(vals[1]),
          unit_number: String(vals[3]),
          title: String(vals[12]),
        })
        return []
      }
      if (sql.includes('INSERT INTO applications')) {
        const vals = params ?? []
        const id = String(vals[0])
        db.applications.set(id, {
          id,
          client_id: String(vals[1]),
          unit_id: String(vals[2]),
          reference_code: String(vals[5]),
        })
        return []
      }
      if (sql.includes('FROM applications') && sql.includes('WHERE id')) {
        const id = String(params?.[0] ?? '')
        const row = db.applications.get(id)
        return row ? [row] : []
      }
      throw new Error(`unexpected sql: ${sql.slice(0, 180)}`)
    })
  })

  it('saves on the live Humewood agency even when the Framesby seed row is in the map', async () => {
    const { resolveUuid } = await import('./entityMap.js')
    // Real resolveUuid: static Framesby uuid wins before the map is consulted.
    expect(await resolveUuid('property', 'PR-1011')).toBe(FRAMESBY_UNIT)

    const { handlePersist } = await import('./writes.js')
    const result = await handlePersist({
      resource: 'application',
      action: 'upsert',
      id: 'APP-thandiwe',
      data: {
        propertyId: 'PR-1011',
        applicantUserId: 'u-thandiwe',
        applicantName: 'Thandiwe Ndlovu',
        email: 'thandiwe.ndlovu.d03@gmail.com',
        phone: '0820000000',
        type: 'Rental',
        stage: 'Application submitted',
        income: 25000,
      },
    })

    const framesbySeed = db.mapRows.find(
      (r) => r.entity_type === 'unit' && r.frontend_id === 'unt-PR-1011' && r.backend_id === FRAMESBY_UNIT,
    )
    expect(framesbySeed).toBeTruthy()

    const listingSelects = query.mock.calls.filter(
      (c) => String(c[0]).includes('entity_id_map') && String(c[0]).includes('JOIN units'),
    )
    expect(listingSelects.length).toBeGreaterThan(0)
    for (const call of listingSelects) {
      expect(String(call[0])).not.toMatch(/LIMIT\s+1/i)
    }

    expect(result.ok).toBe(true)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO applications'))
    expect(insert).toBeTruthy()
    const params = insert![1] as unknown[]
    // Picking the seed row (first in the join) would stamp Bayview, not Horizon.
    expect(params[1]).toBe(HORIZON_CLIENT)
    expect(params[1]).not.toBe(BAYVIEW_CLIENT)
    expect(params[2]).toBe(LIVE_UNIT)
    expect(params[2]).not.toBe(FRAMESBY_UNIT)

    const horizonAdmin = buildPropertyScope(
      { role: 'client_admin', userId: 'u-amelia', agencyId: 'ag-horizon', agencySuspended: false },
      {
        properties: [{ id: 'PR-1011', agencyId: 'ag-horizon', agentId: null, landlordId: 'u-ll' }],
      },
    )
    expect(
      dealInScope(horizonAdmin, {
        propertyId: 'PR-1011',
        agentId: null,
        agencyId: 'ag-horizon',
      }),
    ).toBe(true)
  })

  it('does not stamp Framesby when the live Humewood map hit is missing', async () => {
    // entity_id_map only has the Framesby seed (unit client stays Bayview).
    // The live Humewood Beach Apartment B14 row is in units, not under PR-1012.
    // Beachview Towers B14 (…0003) is also present and must not be chosen.
    const BEACHVIEW_B14 = 'a4000001-0001-4000-8000-000000000003'
    const BEACHVIEW_TOWERS = 'a3000001-0001-4000-8000-000000000002'
    db.mapRows = [
      { entity_type: 'property', frontend_id: 'PR-1011', backend_id: FRAMESBY_UNIT },
      { entity_type: 'unit', frontend_id: 'unt-PR-1011', backend_id: FRAMESBY_UNIT },
    ]
    db.units = new Map([
      [FRAMESBY_UNIT, { id: FRAMESBY_UNIT, client_id: BAYVIEW_CLIENT, building_id: BAYVIEW_BUILDING, title: 'Framesby cottage — Protea Lane' }],
      [LIVE_UNIT, { id: LIVE_UNIT, client_id: HORIZON_CLIENT, building_id: LIVE_BUILDING, title: 'Humewood Beach Apartment B14', unit_number: 'B14' }],
      [BEACHVIEW_B14, { id: BEACHVIEW_B14, client_id: HORIZON_CLIENT, building_id: BEACHVIEW_TOWERS, title: 'Beachview Towers B14 — 2-bed rental', unit_number: 'B14' }],
    ])
    db.buildings.set(LIVE_BUILDING, { id: LIVE_BUILDING, client_id: HORIZON_CLIENT, suburb: 'Humewood' })
    db.buildings.set(BEACHVIEW_TOWERS, { id: BEACHVIEW_TOWERS, client_id: HORIZON_CLIENT, suburb: 'Humewood' })
    expect(db.units.get(FRAMESBY_UNIT)?.client_id).toBe(BAYVIEW_CLIENT)

    const { handlePersist } = await import('./writes.js')
    const result = await handlePersist({
      resource: 'application',
      action: 'upsert',
      id: 'APP-naledi',
      data: {
        propertyId: 'PR-1011',
        applicantName: 'Naledi Dlamini',
        email: 'naledi.dlamini.d03@gmail.com',
        type: 'Rental',
        stage: 'Application submitted',
      },
    })
    expect(result.ok).toBe(true)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO applications'))
    expect(insert).toBeTruthy()
    const params = insert![1] as unknown[]
    expect(params[1]).toBe(HORIZON_CLIENT)
    expect(params[1]).toBe(AGENCY_TO_CLIENT['ag-horizon'])
    expect(params[1]).not.toBe(BAYVIEW_CLIENT)
    expect(params[2]).toBe(LIVE_UNIT)
    expect(params[2]).not.toBe(FRAMESBY_UNIT)
    expect(params[2]).not.toBe(BEACHVIEW_B14)
  })

  it('does not stamp Bayview when the live unit and building have no client', async () => {
    db.mapRows = [
      { entity_type: 'property', frontend_id: 'PR-1011', backend_id: LIVE_UNIT },
      { entity_type: 'unit', frontend_id: 'unt-PR-1011', backend_id: FRAMESBY_UNIT },
    ]
    db.units.set(LIVE_UNIT, { id: LIVE_UNIT, client_id: null, building_id: LIVE_BUILDING, unit_number: 'B14', title: 'Humewood Beach Apartment B14' })
    db.buildings.set(LIVE_BUILDING, { id: LIVE_BUILDING, client_id: null, suburb: 'Humewood' })
    db.units.set(FRAMESBY_UNIT, { id: FRAMESBY_UNIT, client_id: BAYVIEW_CLIENT, building_id: BAYVIEW_BUILDING })
    expect(db.units.get(FRAMESBY_UNIT)?.client_id).toBe(BAYVIEW_CLIENT)
    db.buildings.set(BAYVIEW_BUILDING, { id: BAYVIEW_BUILDING, client_id: BAYVIEW_CLIENT })

    const { handlePersist } = await import('./writes.js')
    const result = await handlePersist({
      resource: 'application',
      action: 'upsert',
      id: 'APP-naledi-empty',
      data: {
        propertyId: 'PR-1011',
        applicantName: 'Naledi Dlamini',
        email: 'naledi.dlamini.d03@gmail.com',
        type: 'Rental',
        stage: 'Application submitted',
      },
    })
    expect(result.ok).toBe(true)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO applications'))
    const params = insert![1] as unknown[]
    expect(params[1]).toBe(HORIZON_CLIENT)
    expect(params[1]).not.toBe(BAYVIEW_CLIENT)
    expect(params[2]).toBe(LIVE_UNIT)
    expect(params[2]).not.toBe(FRAMESBY_UNIT)
    expect(params[2]).not.toBe('a4000001-0001-4000-8000-000000000003')
  })

  it('saves a Humewood application when seed.sql has no Humewood title row', async () => {
    const BEACHVIEW_B14 = 'a4000001-0001-4000-8000-000000000003'
    const BEACHVIEW_TOWERS = 'a3000001-0001-4000-8000-000000000002'
    db.mapRows = [
      { entity_type: 'property', frontend_id: 'PR-1011', backend_id: FRAMESBY_UNIT },
      { entity_type: 'unit', frontend_id: 'unt-PR-1011', backend_id: FRAMESBY_UNIT },
    ]
    db.units = new Map([
      [
        FRAMESBY_UNIT,
        {
          id: FRAMESBY_UNIT,
          client_id: BAYVIEW_CLIENT,
          building_id: BAYVIEW_BUILDING,
          title: 'Framesby cottage — Protea Lane',
          unit_number: 'MAIN',
        },
      ],
      [
        BEACHVIEW_B14,
        {
          id: BEACHVIEW_B14,
          client_id: HORIZON_CLIENT,
          building_id: BEACHVIEW_TOWERS,
          title: 'Beachview Towers B14 — 2-bed rental',
          unit_number: 'B14',
        },
      ],
    ])
    db.buildings.set(BEACHVIEW_TOWERS, { id: BEACHVIEW_TOWERS, client_id: HORIZON_CLIENT, suburb: 'Humewood' })
    expect([...db.units.values()].some((u) => (u.title ?? '').includes('Humewood Beach Apartment B14'))).toBe(false)
    expect(db.units.get(FRAMESBY_UNIT)?.client_id).toBe(BAYVIEW_CLIENT)

    const { handlePersist } = await import('./writes.js')
    const { query: readQuery } = await import('./db.js')
    const result = await handlePersist({
      resource: 'application',
      action: 'upsert',
      id: 'APP-humewood-guest',
      data: {
        propertyId: 'PR-1011',
        applicantName: 'Naledi Dlamini',
        email: 'naledi.dlamini.d03@gmail.com',
        type: 'Rental',
        stage: 'Application submitted',
      },
    })
    expect(result.ok).toBe(true)
    expect(result.id).toBe('APP-humewood-guest')

    const reloaded = await readQuery<{ id: string; client_id: string; unit_id: string }>(
      `SELECT id::text AS id, client_id::text AS client_id, unit_id::text AS unit_id
       FROM applications WHERE id = $1::uuid`,
      [result.uuid],
    )
    expect(reloaded).toHaveLength(1)
    expect(reloaded[0]?.id).toBe(result.uuid)
    expect(reloaded[0]?.client_id).toBe(HORIZON_CLIENT)
    expect(reloaded[0]?.client_id).toBe(AGENCY_TO_CLIENT['ag-horizon'])
    expect(reloaded[0]?.client_id).not.toBe(BAYVIEW_CLIENT)
    expect(reloaded[0]?.unit_id).not.toBe(FRAMESBY_UNIT)
    expect(reloaded[0]?.unit_id).not.toBe(BEACHVIEW_B14)
    expect(reloaded[0]?.unit_id).not.toBe('PR-1011')
    expect(reloaded[0]?.unit_id).not.toBe('unt-skyline-b14')

    const saved = db.units.get(reloaded[0]!.unit_id)
    expect(saved?.title).toBe('Humewood Beach Apartment B14')
    expect(saved?.client_id).toBe(HORIZON_CLIENT)
    expect(db.units.get(FRAMESBY_UNIT)?.client_id).toBe(BAYVIEW_CLIENT)

    const again = await handlePersist({
      resource: 'application',
      action: 'upsert',
      id: 'APP-humewood-unit-fe',
      data: {
        propertyId: 'unt-skyline-b14',
        applicantName: 'Naledi Dlamini',
        email: 'naledi.dlamini.d03@gmail.com',
        type: 'Rental',
        stage: 'Application submitted',
      },
    })
    expect(again.ok).toBe(true)
    const second = db.applications.get(again.uuid)
    expect(second?.unit_id).toBe(reloaded[0]?.unit_id)
    expect(second?.client_id).toBe(HORIZON_CLIENT)
    expect(db.units.get(FRAMESBY_UNIT)?.client_id).toBe(BAYVIEW_CLIENT)
  })

  it('saves the guest full application on Humewood when the listing agent is not a users row', async () => {
    const BEACHVIEW_B14 = 'a4000001-0001-4000-8000-000000000003'
    db.mapRows = [
      { entity_type: 'property', frontend_id: 'PR-1011', backend_id: FRAMESBY_UNIT },
      { entity_type: 'unit', frontend_id: 'unt-PR-1011', backend_id: FRAMESBY_UNIT },
    ]
    db.units = new Map([
      [FRAMESBY_UNIT, { id: FRAMESBY_UNIT, client_id: BAYVIEW_CLIENT, building_id: BAYVIEW_BUILDING, title: 'Framesby cottage — Protea Lane' }],
      [BEACHVIEW_B14, { id: BEACHVIEW_B14, client_id: HORIZON_CLIENT, building_id: 'a3000001-0001-4000-8000-000000000002', title: 'Beachview Towers B14 — 2-bed rental' }],
    ])
    expect(PUBLIC_HUMEWOOD_UNIT_ID).toBe('40588530-0459-4dd3-9ef4-1eb521982479')
    expect(mapProperty(PUBLIC_HUMEWOOD_UNIT_ID)).toBe('PR-1011')
    expect(mapProperty(FRAMESBY_UNIT)).toBe('PR-1011')
    expect(mapProperty(BEACHVIEW_B14)).not.toBe('PR-1011')

    const { handlePersist } = await import('./writes.js')
    const result = await handlePersist({
      resource: 'application',
      action: 'upsert',
      id: 'APP-zanele',
      data: {
        propertyId: 'PR-1011',
        agencyId: 'ag-horizon',
        agentId: 'u-james',
        applicantUserId: 'u-zanele',
        applicantName: 'Zanele Mthembu',
        email: 'zanele.mthembu.d03@gmail.com',
        phone: '0820000000',
        type: 'Rental',
        stage: 'Application submitted',
        income: 18000,
        employment: 'Declared on application',
      },
    })
    expect(result.ok).toBe(true)
    expect(result.id).toBe('APP-zanele')
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO applications'))
    expect(insert).toBeTruthy()
    const params = insert![1] as unknown[]
    expect(params[1]).toBe(HORIZON_CLIENT)
    expect(params[1]).not.toBe(BAYVIEW_CLIENT)
    expect(params[2]).toBe(PUBLIC_HUMEWOOD_UNIT_ID)
    expect(params[2]).not.toBe(FRAMESBY_UNIT)
    expect(params[2]).not.toBe(BEACHVIEW_B14)
    // u-james static uuid is not a users row — do not fail the agent FK.
    expect(params[4]).toBeNull()
    expect(params[7]).toBe('SUBMITTED')
    const saved = db.units.get(String(params[2]))
    expect(saved?.title).toBe('Humewood Beach Apartment B14')
    expect(saved?.client_id).toBe(HORIZON_CLIENT)
    expect(db.units.get(FRAMESBY_UNIT)?.client_id).toBe(BAYVIEW_CLIENT)

    const { query: readQuery } = await import('./db.js')
    const reloaded = await readQuery<{ id: string; client_id: string; unit_id: string; reference_code: string }>(
      `SELECT id::text AS id, client_id::text, unit_id::text, reference_code FROM applications WHERE id = $1::uuid`,
      [result.uuid],
    )
    expect(reloaded).toHaveLength(1)
    expect(reloaded[0]?.reference_code).toBe('APP-zanele')
    expect(reloaded[0]?.unit_id).toBe(PUBLIC_HUMEWOOD_UNIT_ID)
    expect(mapProperty(reloaded[0]?.unit_id)).toBe('PR-1011')
  })
})
