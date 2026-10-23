import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(async (fn: (q: typeof query) => Promise<unknown>) => fn(query)),
  clientQuery: (...args: unknown[]) => query(...args),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

const UNIT = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'
const APP = '33333333-3333-4333-8333-333333333333'
const BOOKING = '66666666-6666-4666-8666-666666666666'

function implement(existing: boolean, withBooking: boolean) {
  query.mockImplementation(async (sql: string) => {
    if (sql.includes('/* apply-eligibility */')) {
      if (existing) throw new Error('eligibility gate must not run on update')
      return [
        {
          unit_id: UNIT,
          client_id: CLIENT,
          building_id: null,
          listing_type: 'RENT',
          require_viewing_to_apply: null,
          settings: {},
          completed_bookings: withBooking
            ? [
                {
                  id: BOOKING,
                  unitId: UNIT,
                  viewingMode: 'IN_PERSON',
                  visitorEmail: 'e2e-tenant@example.com',
                  attendedAt: '2026-11-12T08:00:00.000Z',
                },
              ]
            : [],
          live_override: null,
        },
      ]
    }
    if (sql.includes('FROM applications WHERE id')) {
      return existing
        ? [{ uploaded_docs_json: {}, metadata: {}, unit_id: UNIT, client_id: CLIENT, applicant_id: null }]
        : []
    }
    if (sql.includes('FROM entity_id_map m') && sql.includes('JOIN units')) {
      return [{ id: UNIT, backend_id: UNIT, unit_client: CLIENT, building_client: CLIENT }]
    }
    if (sql.includes('SELECT backend_id')) return [{ backend_id: APP }]
    if (sql.includes('INSERT INTO applications')) return []
    return []
  })
}

describe('application create stores viewing evidence', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('writes the completed booking id on a new rental application', async () => {
    implement(false, true)
    const { handlePersist } = await import('./writes.js')
    await handlePersist(
      {
        resource: 'application',
        action: 'upsert',
        id: 'APP-E2E-1',
        data: {
          propertyId: 'PR-9001',
          email: 'e2e-tenant@example.com',
          applicantName: 'E2E TEST',
          type: 'Rental',
        },
      },
      null,
      'tenant',
    )
    const insert = query.mock.calls.find((call) => String(call[0]).includes('INSERT INTO applications'))
    expect(insert).toBeTruthy()
    expect(String(insert?.[0])).toContain('viewing_booking_id')
    const params = insert?.[1] as unknown[]
    expect(params[19]).toBe(BOOKING)
  })

  it('does not re-check an existing application', async () => {
    implement(true, false)
    const { handlePersist } = await import('./writes.js')
    await handlePersist(
      {
        resource: 'application',
        action: 'upsert',
        id: 'APP-E2E-1',
        data: {
          propertyId: 'PR-9001',
          email: 'e2e-tenant@example.com',
          applicantName: 'E2E TEST',
          type: 'Rental',
        },
      },
      null,
      'tenant',
    )
    const insert = query.mock.calls.find((call) => String(call[0]).includes('INSERT INTO applications'))
    const params = insert?.[1] as unknown[]
    expect(params[19]).toBeNull()
    expect(params[20]).toBeNull()
  })

  it('blocks a new rental when no completed viewing exists', async () => {
    implement(false, false)
    const { handlePersist } = await import('./writes.js')
    await expect(
      handlePersist(
        {
          resource: 'application',
          action: 'upsert',
          id: 'APP-E2E-2',
          data: {
            propertyId: 'PR-9002',
            email: 'e2e-tenant@example.com',
            applicantName: 'E2E TEST',
            type: 'Rental',
          },
        },
        null,
        'tenant',
      ),
    ).rejects.toMatchObject({ code: 'VIEWING_REQUIRED' })
  })
})
