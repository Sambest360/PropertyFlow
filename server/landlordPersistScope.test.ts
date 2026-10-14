import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * FW-08 L03: pending-verification landlords must persist draft listings
 * (building → unit → property) on their own ag-ll portfolio.
 */
const query = vi.fn()
const resolveUuid = vi.fn()

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: async (fn: (c: unknown) => Promise<unknown>) => fn({}),
  clientQuery: async (_c: unknown, sql: string, params?: unknown[]) => query(sql, params),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => undefined),
  resolveUuid: (...args: unknown[]) => resolveUuid(...args),
  ensureUuid: vi.fn(async (_t: string, fe: string) => UUID[fe] ?? '00000000-0000-4000-8000-00000000ffff'),
  forgetId: vi.fn(),
  isUuid: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

const loadIdMapCache = vi.fn()
vi.mock('./idMapCache.js', async () => {
  const actual = await vi.importActual<typeof import('./idMapCache.js')>('./idMapCache.js')
  return { ...actual, loadIdMapCache: (...args: unknown[]) => loadIdMapCache(...args) }
})

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const LL_AGENCY = id(1)
const UUID: Record<string, string> = {
  'u-ll': id(20),
  'ag-ll-johan': LL_AGENCY,
  'bld-new': id(30),
  'unt-new': id(40),
}

const FE_BY_UUID = new Map(Object.entries(UUID).map(([fe, u]) => [u, fe]))

const users: Record<string, { client_id: string | null }> = {
  [UUID['u-ll']]: { client_id: LL_AGENCY },
}

let buildings: Record<string, { client_id: string; landlord_id: string | null }>

function resetModel() {
  buildings = {
    [UUID['bld-new']]: { client_id: LL_AGENCY, landlord_id: UUID['u-ll'] },
  }
}

function answer(sqlRaw: string, params: unknown[] = []): unknown[] {
  const sql = sqlRaw.replace(/\s+/g, ' ').trim()
  if (sql.includes('SELECT entity_type, frontend_id, backend_id::text FROM entity_id_map')) {
    return []
  }
  if (sql.startsWith('SELECT id::text AS id, email FROM users')) {
    return []
  }
  if (sql.includes('FROM units u JOIN buildings b ON b.id = u.building_id') && !sql.includes('WHERE')) {
    return []
  }
  if (sql.includes('FROM applications')) return []
  if (sql.includes('SELECT tenant_id, unit_id FROM leases')) return []
  if (sql.includes('FROM maintenance_tickets')) return []
  if (sql.includes('FROM agency_contractors')) return []
  if (sql.includes('SELECT client_id FROM users WHERE id')) {
    const row = users[String(params[0])]
    return row ? [{ client_id: row.client_id }] : []
  }
  if (sql.includes('SELECT status FROM clients WHERE id')) {
    return [{ status: 'active' }]
  }
  if (sql.includes('SELECT client_id, landlord_id FROM buildings WHERE id')) {
    const row = buildings[String(params[0])]
    return row ? [{ client_id: row.client_id, landlord_id: row.landlord_id }] : []
  }
  if (sql.includes('FROM units u JOIN buildings b') && sql.includes('WHERE u.id')) {
    return []
  }
  return []
}

beforeEach(() => {
  resetModel()
  query.mockReset()
  query.mockImplementation(async (sql: string, params?: unknown[]) => answer(sql, params))
  resolveUuid.mockReset()
  resolveUuid.mockImplementation(async (_t: string, fe: string) => UUID[fe] ?? null)
  loadIdMapCache.mockReset()
  loadIdMapCache.mockResolvedValue({
    userBackendToFe: new Map([[UUID['u-ll'], 'u-ll']]),
    unitBackendToPropertyFe: new Map(),
    agencyBackendToFe: new Map([[LL_AGENCY, 'ag-ll-johan']]),
  })
})

afterEach(() => {
  vi.resetModules()
})

const LANDLORD = { userId: 'u-ll', role: 'landlord', agencyId: 'ag-ll-johan' }

async function gate(body: Record<string, unknown>) {
  const { assertPersistAllowed } = await import('./scopeGate.js')
  return assertPersistAllowed(LANDLORD as never, body as never)
}

describe('FW-08 L03 landlord draft persist scope', () => {
  it(
    'allows building create on own ag-ll portfolio (verification pending)',
    async () => {
    await expect(
      gate({
        resource: 'building',
        action: 'upsert',
        id: 'bld-new',
        data: {
          clientId: 'ag-ll-johan',
          name: 'Draft building',
          addressLine1: '1 Main Rd',
          city: 'Gqeberha',
          province: 'EC',
          suburb: 'Central',
        },
      }),
    ).resolves.toEqual({})
    },
    15_000,
  )

  it('allows unit create when landlordId is only on the building row', async () => {
    await expect(
      gate({
        resource: 'unit',
        action: 'upsert',
        id: 'unt-new',
        data: {
          clientId: 'ag-ll-johan',
          buildingId: 'bld-new',
          unitNumber: '1',
          title: 'Draft unit',
          listingType: 'rent',
        },
      }),
    ).resolves.toEqual({})
  })

  it('refuses a landlord writing a building for another portfolio', async () => {
    await expect(
      gate({
        resource: 'building',
        action: 'upsert',
        id: 'bld-x',
        data: {
          clientId: 'ag-other',
          landlordId: 'u-ll',
          name: 'Nope',
          addressLine1: 'x',
        },
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
