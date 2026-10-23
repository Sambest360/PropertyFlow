import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Michael's ruling on PR #109: only agency staff may set the per-unit
 * viewing-gate override (units.require_viewing_to_apply). A landlord editing
 * their own listing may not change it.
 */

const query = vi.fn()
const ensureUuid = vi.fn()
const resolveUuid = vi.fn()

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./entityMap.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./entityMap.js')>()
  return {
    ...actual,
    ensureEntityMapTable: vi.fn(async () => undefined),
    ensureUuid: (...args: unknown[]) => ensureUuid(...args),
    resolveUuid: (...args: unknown[]) => resolveUuid(...args),
    forgetId: vi.fn(),
  }
})

const AGENCY_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const UNIT_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const BUILDING_UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

let storedRequire: boolean | null = null
let unitExists = true
const UNIT_WRITE = /INSERT INTO (units|buildings)|UPDATE (units|buildings)/

function writtenSql(): string[] {
  return query.mock.calls.map((c) => String(c[0]))
}

function unitInsertParams(): unknown[] {
  const call = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO units'))
  expect(call).toBeTruthy()
  return call![1] as unknown[]
}

async function persistUnit(actorRole: string | null, data: Record<string, unknown>) {
  const { handlePersist } = await import('./writes.js')
  return handlePersist(
    {
      resource: 'property',
      action: 'upsert',
      id: 'unt-viewing-override',
      data: { agencyId: 'ag-fixture', buildingId: 'bld-fixture', title: 'Unit 1', rent: 9000, ...data },
    },
    'usr-actor',
    actorRole,
  )
}

describe('per-unit viewing-gate override is agency staff only', () => {
  beforeEach(() => {
    storedRequire = null
    unitExists = true
    query.mockReset()
    resolveUuid.mockReset()
    ensureUuid.mockReset()
    resolveUuid.mockImplementation(async (et: string) => {
      if (et === 'agency') return AGENCY_UUID
      if (et === 'building') return BUILDING_UUID
      if (et === 'property' || et === 'unit') return unitExists ? UNIT_UUID : null
      return null
    })
    ensureUuid.mockImplementation(async (et: string, _fe: string, preferred?: string) => {
      if (preferred) return preferred
      if (et === 'building') return BUILDING_UUID
      return UNIT_UUID
    })
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('/* unit-viewing-override */')) return [{ require_viewing_to_apply: storedRequire }]
      if (sql.includes('SELECT status_config_key, listing_type, agent_id FROM units')) {
        return [{ status_config_key: 'PUBLISHED', listing_type: 'RENT', agent_id: null }]
      }
      return []
    })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('refuses a landlord turning the rule on, before anything is written', async () => {
    await expect(persistUnit('landlord', { requireViewingToApply: true })).rejects.toMatchObject({
      status: 403,
      code: 'VIEWING_OVERRIDE_STAFF_ONLY',
    })
    expect(writtenSql().some((s) => UNIT_WRITE.test(s))).toBe(false)
  })

  it('refuses a landlord turning a staff-set rule off or back to the agency default', async () => {
    storedRequire = true
    await expect(persistUnit('landlord', { requireViewingToApply: false })).rejects.toMatchObject({
      code: 'VIEWING_OVERRIDE_STAFF_ONLY',
    })
    await expect(persistUnit('landlord', { requireViewingToApply: null })).rejects.toMatchObject({
      code: 'VIEWING_OVERRIDE_STAFF_ONLY',
    })
  })

  it('refuses a landlord creating a new unit with the rule set, without touching the id map', async () => {
    unitExists = false
    await expect(persistUnit('landlord', { requireViewingToApply: false })).rejects.toMatchObject({
      code: 'VIEWING_OVERRIDE_STAFF_ONLY',
    })
    expect(writtenSql().some((s) => UNIT_WRITE.test(s))).toBe(false)
    expect(ensureUuid).not.toHaveBeenCalled()
  })

  it("lets a landlord create a new unit that follows the agency default", async () => {
    unitExists = false
    const result = await persistUnit('landlord', { requireViewingToApply: null })
    expect(result.ok).toBe(true)
    expect(unitInsertParams()[26]).toBe(false)
  })

  it('refuses tenants, contractors and an unknown role too', async () => {
    for (const role of ['tenant', 'contractor', null]) {
      await expect(persistUnit(role, { requireViewingToApply: true })).rejects.toMatchObject({
        code: 'VIEWING_OVERRIDE_STAFF_ONLY',
      })
    }
  })

  it("lets a landlord's edit through when it repeats the stored value, and keeps the stored value", async () => {
    storedRequire = true
    const result = await persistUnit('landlord', { requireViewingToApply: true, rent: 9500 })
    expect(result.ok).toBe(true)
    const params = unitInsertParams()
    expect(params[26]).toBe(false) // not "sent": ON CONFLICT keeps units.require_viewing_to_apply
  })

  it("lets a landlord's edit through when the key is not sent", async () => {
    storedRequire = true
    const result = await persistUnit('landlord', { rent: 9500 })
    expect(result.ok).toBe(true)
    expect(unitInsertParams()[26]).toBe(false)
    expect(writtenSql().some((s) => s.includes('/* unit-viewing-override */'))).toBe(false)
  })

  it.each(['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent'])(
    'lets %s set the rule',
    async (role) => {
      const result = await persistUnit(role, { requireViewingToApply: true })
      expect(result.ok).toBe(true)
      const params = unitInsertParams()
      expect(params[25]).toBe(true)
      expect(params[26]).toBe(true)
    },
  )

  it('lets agency staff clear the rule back to the agency default', async () => {
    storedRequire = true
    await persistUnit('client_admin', { requireViewingToApply: null })
    const params = unitInsertParams()
    expect(params[25]).toBe(null)
    expect(params[26]).toBe(true)
  })
})
