import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const resolveUuid = vi.fn()
const ensureEntityMapTable = vi.fn(async () => undefined)

const QA_CLIENT_UUID = '7515d803-1111-4111-8111-111111111111'
const OTHER_CLIENT_UUID = '99999999-9999-4999-8999-999999999999'
const AGENCY_FE = 'ag-rhtxlh'
const OTHER_AGENCY_FE = 'ag-other'
const UNIT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const APP_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const USER_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const PROP_FE = '0ezv31'

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: (...args: unknown[]) => ensureEntityMapTable(...args),
  resolveUuid: (...args: unknown[]) => resolveUuid(...args),
  ensureUuid: vi.fn(),
  forgetId: vi.fn(),
  isUuid: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

const loadIdMapCache = vi.fn()
vi.mock('./idMapCache.js', async () => {
  const actual = await vi.importActual<typeof import('./idMapCache.js')>('./idMapCache.js')
  return {
    ...actual,
    loadIdMapCache: (...args: unknown[]) => loadIdMapCache(...args),
  }
})

function agencyCache(extra?: Record<string, string>) {
  return {
    userBackendToFe: new Map<string, string>(),
    unitBackendToPropertyFe: new Map([[UNIT_UUID, PROP_FE]]),
    agencyBackendToFe: new Map([
      [QA_CLIENT_UUID, AGENCY_FE],
      [OTHER_CLIENT_UUID, OTHER_AGENCY_FE],
      ...(extra ? Object.entries(extra) : []),
    ]),
  }
}

describe('scopeGate agency FE (P0 r20)', () => {
  beforeEach(() => {
    query.mockReset()
    resolveUuid.mockReset()
    ensureEntityMapTable.mockClear()
    loadIdMapCache.mockReset()
    loadIdMapCache.mockResolvedValue(agencyCache())
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('enrichActor maps UUID client_id to FE agency via agencyBackendToFe', async () => {
    resolveUuid.mockResolvedValue(USER_UUID)
    query.mockResolvedValue([{ client_id: QA_CLIENT_UUID }])
    const { enrichActor } = await import('./scopeGate.js')
    const out = await enrichActor({
      userId: 'u-95838e33',
      role: 'ground_agent',
      agencyId: null,
    })
    expect(out.agencyId).toBe(AGENCY_FE)
  })

  it('assertPersistAllowed: FE actor + UUID existing agency normalize → allow Unassigned app', async () => {
    // Scope links: property in QA agency assigned to other agent → off-book for FA;
    // deal agentId null = Unassigned pool (dealInScope) — remint shape for APP-it4z5k.
    const otherAgentUuid = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    loadIdMapCache.mockResolvedValue({
      ...agencyCache(),
      userBackendToFe: new Map([[otherAgentUuid, 'u-other-fa']]),
    })
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM units u') && sql.includes('JOIN buildings')) {
        return [
          {
            unit_id: UNIT_UUID,
            client_id: QA_CLIENT_UUID,
            agent_id: otherAgentUuid,
            landlord_id: null,
          },
        ]
      }
      if (sql.includes('FROM applications a')) return []
      if (sql.includes('FROM leases')) return []
      if (sql.includes('FROM maintenance_tickets') && sql.includes('contractor_id')) return []
      if (sql.includes('FROM clients WHERE id')) return [{ status: 'active' }]
      // loadExisting application
      if (sql.includes('FROM applications WHERE reference_code')) {
        return [{ id: APP_UUID }]
      }
      if (sql.includes('applications') && sql.includes('WHERE id') && !sql.includes('reference_code')) {
        return [
          {
            id: APP_UUID,
            unit_id: UNIT_UUID,
            client_id: QA_CLIENT_UUID,
            agent_id: null,
          },
        ]
      }
      return []
    })
    resolveUuid.mockImplementation(async (et: string, fe: string) => {
      if (et === 'application' && fe === 'APP-it4z5k') return APP_UUID
      if (et === 'agency') return QA_CLIENT_UUID
      if (et === 'user') return USER_UUID
      return null
    })

    const { assertPersistAllowed } = await import('./scopeGate.js')
    await expect(
      assertPersistAllowed(
        { userId: 'u-95838e33', role: 'ground_agent', agencyId: AGENCY_FE },
        {
          resource: 'application',
          action: 'upsert',
          id: 'APP-it4z5k',
          // Omit agencyId so fallback uses existing (UUID in DB) — must normalize to FE
          data: {
            propertyId: PROP_FE,
            agentId: null,
          },
        },
      ),
    ).resolves.toBeUndefined()
  })

  it('assertPersistAllowed: cross-agency Unassigned still deny', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM units u') && sql.includes('JOIN buildings')) {
        return [
          {
            unit_id: UNIT_UUID,
            client_id: OTHER_CLIENT_UUID,
            agent_id: null,
            landlord_id: null,
          },
        ]
      }
      if (sql.includes('FROM applications a')) return []
      if (sql.includes('FROM leases')) return []
      if (sql.includes('FROM maintenance_tickets') && sql.includes('contractor_id')) return []
      if (sql.includes('FROM clients WHERE id')) return [{ status: 'active' }]
      if (sql.includes('FROM applications WHERE reference_code')) {
        return [{ id: APP_UUID }]
      }
      if (sql.includes('applications') && sql.includes('WHERE id') && !sql.includes('reference_code')) {
        return [
          {
            id: APP_UUID,
            unit_id: UNIT_UUID,
            client_id: OTHER_CLIENT_UUID,
            agent_id: null,
          },
        ]
      }
      return []
    })
    resolveUuid.mockImplementation(async (et: string, fe: string) => {
      if (et === 'application' && fe === 'APP-it4z5k') return APP_UUID
      if (et === 'agency' && fe === AGENCY_FE) return QA_CLIENT_UUID
      if (et === 'agency' && fe === OTHER_AGENCY_FE) return OTHER_CLIENT_UUID
      return null
    })

    const { assertPersistAllowed } = await import('./scopeGate.js')
    await expect(
      assertPersistAllowed(
        { userId: 'u-95838e33', role: 'ground_agent', agencyId: AGENCY_FE },
        {
          resource: 'application',
          action: 'upsert',
          id: 'APP-it4z5k',
          data: {
            propertyId: PROP_FE,
            agentId: null,
          },
        },
      ),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('assertPersistAllowed: payload UUID agencyId normalized to FE → allow', async () => {
    const otherAgentUuid = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    loadIdMapCache.mockResolvedValue({
      ...agencyCache(),
      userBackendToFe: new Map([[otherAgentUuid, 'u-other-fa']]),
    })
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM units u') && sql.includes('JOIN buildings')) {
        return [
          {
            unit_id: UNIT_UUID,
            client_id: QA_CLIENT_UUID,
            agent_id: otherAgentUuid,
            landlord_id: null,
          },
        ]
      }
      if (sql.includes('FROM applications a')) return []
      if (sql.includes('FROM leases')) return []
      if (sql.includes('FROM maintenance_tickets') && sql.includes('contractor_id')) return []
      if (sql.includes('FROM clients WHERE id')) return [{ status: 'active' }]
      if (sql.includes('FROM applications WHERE reference_code')) {
        return [{ id: APP_UUID }]
      }
      if (sql.includes('applications') && sql.includes('WHERE id') && !sql.includes('reference_code')) {
        return [
          {
            id: APP_UUID,
            unit_id: UNIT_UUID,
            client_id: QA_CLIENT_UUID,
            agent_id: null,
          },
        ]
      }
      return []
    })
    resolveUuid.mockImplementation(async (et: string, fe: string) => {
      if (et === 'application' && fe === 'APP-it4z5k') return APP_UUID
      if (et === 'agency') return QA_CLIENT_UUID
      return null
    })

    const { assertPersistAllowed } = await import('./scopeGate.js')
    await expect(
      assertPersistAllowed(
        { userId: 'u-95838e33', role: 'ground_agent', agencyId: AGENCY_FE },
        {
          resource: 'application',
          action: 'upsert',
          id: 'APP-it4z5k',
          data: {
            propertyId: PROP_FE,
            agencyId: QA_CLIENT_UUID, // raw UUID in payload
            agentId: null,
          },
        },
      ),
    ).resolves.toBeUndefined()
  })
})
