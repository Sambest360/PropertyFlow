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
    loadIdMapCache.mockImplementation(async () => agencyCache())
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

  it('enrichActor normalizes a UUID agencyId header to FE (stale session / id-map)', async () => {
    resolveUuid.mockResolvedValue(null)
    query.mockResolvedValue([])
    const { enrichActor } = await import('./scopeGate.js')
    const out = await enrichActor({
      userId: 'u-95838e33',
      role: 'client_admin',
      agencyId: QA_CLIENT_UUID,
    })
    expect(out.agencyId).toBe(AGENCY_FE)
  })

  it('assertPersistAllowed: denies FA upsert on unassigned off-book application', async () => {
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
          data: {
            propertyId: PROP_FE,
            agentId: null,
          },
        },
      ),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('assertPersistAllowed: cross-agency unassigned still deny', async () => {
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

  it('assertPersistAllowed: payload UUID agencyId normalized to FE → allow on assigned book', async () => {
    const faUuid = USER_UUID
    loadIdMapCache.mockResolvedValue({
      ...agencyCache(),
      userBackendToFe: new Map([[faUuid, 'u-95838e33']]),
    })
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM units u') && sql.includes('JOIN buildings')) {
        return [
          {
            unit_id: UNIT_UUID,
            client_id: QA_CLIENT_UUID,
            agent_id: faUuid,
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
            agentId: 'u-95838e33',
          },
        },
      ),
    ).resolves.toEqual({})
  })

  it('assertPersistAllowed: ground_agent upsert unassigned unit in agency is blocked', async () => {
    loadIdMapCache.mockResolvedValue({
      ...agencyCache(),
      userBackendToFe: new Map([[USER_UUID, 'u-95838e33']]),
    })
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM units u') && sql.includes('JOIN buildings')) {
        if (sql.includes('WHERE u.id')) {
          return [
            {
              client_id: QA_CLIENT_UUID,
              agent_id: null,
              landlord_id: null,
              status_config_key: 'DRAFT',
            },
          ]
        }
        return [
          {
            unit_id: UNIT_UUID,
            client_id: QA_CLIENT_UUID,
            agent_id: null,
            landlord_id: null,
          },
        ]
      }
      if (sql.includes('FROM applications a')) return []
      if (sql.includes('FROM leases')) return []
      if (sql.includes('FROM maintenance_tickets')) return []
      if (sql.includes('FROM clients WHERE id')) return [{ status: 'active' }]
      return []
    })
    resolveUuid.mockImplementation(async (et: string, fe: string) => {
      if ((et === 'property' || et === 'unit') && fe === PROP_FE) return UNIT_UUID
      if (et === 'agency') return QA_CLIENT_UUID
      return null
    })

    const { assertPersistAllowed } = await import('./scopeGate.js')
    await expect(
      assertPersistAllowed(
        { userId: 'u-95838e33', role: 'ground_agent', agencyId: AGENCY_FE },
        {
          resource: 'unit',
          action: 'upsert',
          id: PROP_FE,
          data: {
            agencyId: AGENCY_FE,
            agentId: 'u-95838e33',
            title: 'Coastal listing',
          },
        },
      ),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('assertPersistAllowed: ground_agent denied upsert unit assigned to another agent', async () => {
    const otherAgentUuid = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    loadIdMapCache.mockResolvedValue({
      ...agencyCache(),
      userBackendToFe: new Map([[otherAgentUuid, 'u-other-fa']]),
    })
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM units u') && sql.includes('JOIN buildings')) {
        if (sql.includes('WHERE u.id')) {
          return [
            {
              client_id: QA_CLIENT_UUID,
              agent_id: otherAgentUuid,
              landlord_id: null,
              status_config_key: 'DRAFT',
            },
          ]
        }
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
      if (sql.includes('FROM maintenance_tickets')) return []
      if (sql.includes('FROM clients WHERE id')) return [{ status: 'active' }]
      return []
    })
    resolveUuid.mockImplementation(async (et: string, fe: string) => {
      if ((et === 'property' || et === 'unit') && fe === PROP_FE) return UNIT_UUID
      if (et === 'agency') return QA_CLIENT_UUID
      return null
    })

    const { assertPersistAllowed } = await import('./scopeGate.js')
    await expect(
      assertPersistAllowed(
        { userId: 'u-95838e33', role: 'ground_agent', agencyId: AGENCY_FE },
        {
          resource: 'unit',
          action: 'upsert',
          id: PROP_FE,
          data: { agencyId: AGENCY_FE, title: 'Nope' },
        },
      ),
    ).rejects.toMatchObject({ status: 403 })
  })
})
