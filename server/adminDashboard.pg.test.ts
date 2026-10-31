import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * The admin dashboard SQL against a REAL scratch Postgres built from
 * database/postgres/schema.sql (never live). Runs only when PF_TEST_PG_URL
 * points at a throwaway local database; everything it inserts is rolled back.
 * Two agencies with known data: the super admin sees both, agency A's admin
 * sees only A's figures.
 */
const url = process.env.PF_TEST_PG_URL
const db = vi.hoisted(() => ({
  client: null as null | { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  ids: { a: '', b: '', adminA: '' },
}))
vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: async (sql: string, params: unknown[] = []) => {
    if (!db.client) throw new Error('no test client')
    return (await db.client.query(sql, params)).rows
  },
}))
vi.mock('./entityMap.js', () => ({
  resolveUuid: async (_type: string, id: string) => id,
  staticFrontendId: () => null,
}))
vi.mock('./scopeGate.js', () => ({
  enrichActor: async (a: unknown) => a,
  agencyFeForClient: async (id: string) => id,
}))

import { buildDashboard, listAccessPeople, resolveDashboardViewer } from './adminDashboard.js'
import type { DemoActor } from './actor.js'

const deps = { commit: () => null, authMode: () => null }

describe.skipIf(!url)('admin dashboard on a schema.sql Postgres', () => {
  let client: pg.Client

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query('BEGIN')
    db.client = client
    const one = async (sql: string, params: unknown[] = []) =>
      ((await client.query<{ id: string }>(sql, params)).rows[0]?.id ?? '') as string
    const tag = (await client.query<{ t: string }>(`SELECT substr(md5(random()::text), 1, 8) AS t`)).rows[0].t
    const agency = (name: string, status: string) =>
      one(`INSERT INTO clients (subdomain, company_name, status) VALUES ($1, $2, $3) RETURNING id::text AS id`, [`${name.toLowerCase()}-${tag}`, name, status])
    db.ids.a = await agency('Alpha', 'active')
    db.ids.b = await agency('Bravo', 'suspended')
    const user = (client_id: string | null, role: string, email: string, meta: object = {}, active = true) =>
      one(
        `INSERT INTO users (client_id, email, password_hash, first_name, last_name, role, active, metadata)
         VALUES ($1, $2, 'x', 'Test', $3, $4, $5, $6::jsonb) RETURNING id::text AS id`,
        [client_id, `${email}-${tag}@t.invalid`, role, role, active, JSON.stringify(meta)],
      )
    db.ids.adminA = await user(db.ids.a, 'AGENCY_ADMIN', 'admin-a')
    await user(db.ids.a, 'GROUND_AGENT', 'agent-a')
    const landlordA = await user(db.ids.a, 'LANDLORD', 'll-a', { verification: { status: 'pending' } })
    const tenantA = await user(db.ids.a, 'END_USER', 'tenant-a')
    await user(db.ids.a, 'END_USER', 'gone-a', { deletedAt: '2026-10-01T00:00:00Z' }, false)
    await user(db.ids.b, 'AGENT_ADMIN', 'admin-b')
    await user(db.ids.b, 'END_USER', 'tenant-b', {}, false)

    const building = (c: string, landlord: string | null) =>
      one(`INSERT INTO buildings (client_id, landlord_id, name, address, city, province) VALUES ($1, $2, 'B', '1 St', 'Gqeberha', 'EC') RETURNING id::text AS id`, [c, landlord])
    const unit = (c: string, b: string, no: string, status: string, listing: string, featured = false, images = '[]') =>
      one(
        `INSERT INTO units (client_id, building_id, unit_number, status_config_key, listing_type, featured, images, rent)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 9000) RETURNING id::text AS id`,
        [c, b, no, status, listing, featured, images],
      )
    const bA = await building(db.ids.a, landlordA)
    const u1 = await unit(db.ids.a, bA, '1', 'OCCUPIED', 'RENT')
    await unit(db.ids.a, bA, '2', 'PUBLISHED', 'RENT', true, '["/a.jpg"]')
    await unit(db.ids.a, bA, '3', 'PUBLISHED', 'SALE') // listed, no photos
    await unit(db.ids.a, bA, '4', 'DELETED', 'NOT_LISTED') // archived: not counted
    const bB = await building(db.ids.b, null)
    const uB = await unit(db.ids.b, bB, '1', 'AVAILABLE', 'BOTH')

    await client.query(
      `INSERT INTO leads (client_id, unit_id, name, interest_type, created_at) VALUES
         ($1, $2, 'L1', 'RENT', NOW() - INTERVAL '2 days'),
         ($1, $2, 'L2', 'BUY', NOW() - INTERVAL '20 days'),
         ($3, $4, 'LB', 'RENT', NOW() - INTERVAL '1 day')`,
      [db.ids.a, u1, db.ids.b, uB],
    )
    await client.query(
      `INSERT INTO applications (client_id, unit_id, reference_code, status, submitted_at) VALUES
         ($1, $2, 'A-1', 'SUBMITTED', NOW() - INTERVAL '10 days'),
         ($1, $2, 'A-2', 'UNDER_REVIEW', NOW() - INTERVAL '1 day'),
         ($1, $2, 'A-3', 'APPROVED', NOW() - INTERVAL '3 days'),
         ($3, $4, 'B-1', 'SUBMITTED', NOW() - INTERVAL '30 days')`,
      [db.ids.a, u1, db.ids.b, uB],
    )
    const lease = await one(
      `INSERT INTO leases (client_id, unit_id, tenant_id, lease_reference, status, start_date, end_date, rent_amount)
       VALUES ($1, $2, $3, 'LS-1', 'ACTIVE', CURRENT_DATE - 300, CURRENT_DATE + 20, 9000) RETURNING id::text AS id`,
      [db.ids.a, u1, tenantA],
    )
    await client.query(
      `INSERT INTO payments (client_id, unit_id, lease_id, party_name, payment_type, amount, paid_amount, status, due_date, paid_at) VALUES
         ($1, $2, $3, 'T', 'RENT', 9000, 9000, 'PAID', CURRENT_DATE, NOW()),
         ($1, $2, $3, 'T', 'RENT', 9000, 2000, 'OVERDUE', CURRENT_DATE - 40, NULL),
         ($1, $2, $3, 'T', 'RENT', 9000, NULL, 'DUE', CURRENT_DATE - 5, NULL),
         ($1, $2, $3, 'T', 'RENT', 500, NULL, 'CANCELLED', CURRENT_DATE - 5, NULL),
         ($4, $5, NULL, 'X', 'RENT', 7000, NULL, 'OVERDUE', CURRENT_DATE - 9, NULL)`,
      [db.ids.a, u1, lease, db.ids.b, uB],
    )
    await client.query(
      `INSERT INTO maintenance_tickets (client_id, unit_id, title, description, priority, status, sla_due_at) VALUES
         ($1, $2, 'Leak', 'x', 'URGENT', 'OPEN', NOW() - INTERVAL '1 hour'),
         ($1, $2, 'Bulb', 'x', 'LOW', 'IN_PROGRESS', NULL),
         ($1, $2, 'Done', 'x', 'HIGH', 'COMPLETED', NULL),
         ($3, $4, 'Door', 'x', 'EMERGENCY', 'OPEN', NULL)`,
      [db.ids.a, u1, db.ids.b, uB],
    )
    await client.query(
      `INSERT INTO event_log (client_id, event_type, subject_type, actor_user_id, payload) VALUES
         ($1, 'activity', 'agency', $3, '{"text":"Payment marked paid"}'),
         ($1, 'impersonation', 'user', NULL, '{"route":"GET /api/bootstrap"}'),
         ($2, 'activity', 'agency', NULL, '{"text":"Bravo thing"}'),
         ($1, 'lease_end_reminder', 'lease', NULL, '{}')`,
      [db.ids.a, db.ids.b, db.ids.adminA],
    )
  })

  afterAll(async () => {
    db.client = null
    if (client) {
      await client.query('ROLLBACK').catch(() => undefined)
      await client.end()
    }
  })

  const superAdmin = { role: 'super_admin', userId: 'sa', agencyId: null } as unknown as DemoActor
  const adminA = () => ({ role: 'client_admin', userId: db.ids.adminA, agencyId: db.ids.a }) as unknown as DemoActor

  it('agency admin sees only their agency, with correct figures', async () => {
    const out = await buildDashboard(await resolveDashboardViewer(adminA()), deps)
    expect(out.scope).toMatchObject({ kind: 'agency', agencyId: db.ids.a, agencyName: 'Alpha' })
    expect(out.kpis.people).toMatchObject({ total: 4, inactive: 0, pendingReview: 1 })
    expect(out.kpis.people?.byRole).toEqual({ client_admin: 1, ground_agent: 1, landlord: 1, tenant: 1 })
    expect(out.kpis.portfolio).toEqual({ buildings: 1, units: 3, occupied: 1, vacant: 2, occupancyRate: 33.3 })
    expect(out.kpis.listings).toMatchObject({ published: 2, forSale: 1, toRent: 1, featured: 1, noPhotos: 1 })
    expect(out.kpis.leads).toMatchObject({ total: 2, last7: 1, last30: 2, buy30: 1, rent30: 1 })
    expect(out.kpis.applications).toMatchObject({ open: 2, stale: 1, byStatus: { SUBMITTED: 1, UNDER_REVIEW: 1, APPROVED: 1 } })
    expect(out.kpis.leases).toMatchObject({ active: 1, expiring: { d30: 1, d60: 0, d90: 0 }, monthlyRentRoll: 9000 })
    expect(out.kpis.payments).toEqual({
      paidThisMonth: { count: 1, amount: 9000 },
      overdue: { count: 2, amount: 16000 },
      outstanding: { count: 2, amount: 16000 },
      dueThisMonth: expect.any(Object),
    })
    expect(out.kpis.maintenance).toEqual({ open: 2, byPriority: { URGENT: 1, LOW: 1 }, slaBreached: 1 })
    expect(out.agencies).toBeUndefined()
    expect(out.health).toBeUndefined()
    const feed = out.activity ?? []
    expect(feed.some((e) => e.detail === 'Payment marked paid' && e.actorName === 'Test AGENCY_ADMIN')).toBe(true)
    expect(feed.some((e) => e.type === 'impersonation')).toBe(false)
    expect(feed.some((e) => e.detail === 'Bravo thing')).toBe(false)
    expect(feed.some((e) => e.type === 'lease_end_reminder')).toBe(false)
    expect(out.trends).toHaveLength(90)
    expect(out.trends.reduce((a, t) => a + (t.leads ?? 0), 0)).toBe(2)
    expect(out.attention.map((a) => a.id)).toEqual(
      expect.arrayContaining(['overdue-payments', 'stale-applications', 'urgent-tickets', 'sla-breached', 'leases-expiring', 'no-photos', 'pending-review']),
    )
  })

  it('super admin sees both agencies', async () => {
    const out = await buildDashboard(await resolveDashboardViewer(superAdmin), deps)
    expect(out.scope.kind).toBe('platform')
    expect(out.kpis.agencies?.byStatus).toMatchObject({ active: expect.any(Number), suspended: expect.any(Number) })
    const rows = (out.agencies ?? []).filter((r) => r.clientId === db.ids.a || r.clientId === db.ids.b)
    expect(rows.map((r) => r.name)).toEqual(['Alpha', 'Bravo'])
    expect(rows[0]).toMatchObject({ users: 4, staff: 2, units: 3, occupied: 1, listings: 2, overdueCount: 2, overdueAmount: 16000, openTickets: 2, openApplications: 2 })
    expect(rows[1]).toMatchObject({ users: 2, units: 1, listings: 1, overdueCount: 1, overdueAmount: 7000, openTickets: 1, status: 'suspended' })
    expect(rows[0].lastActivityAt).not.toBeNull()
    const feed = out.activity ?? []
    expect(feed.some((e) => e.type === 'impersonation')).toBe(true)
    expect(feed.some((e) => e.detail === 'Bravo thing')).toBe(true)
    expect(out.health?.database).toBe('up')
    expect(out.health?.emailLog.available).toBe(false)
  })

  it('access list: agency admin sees their own agency’s people only', async () => {
    const { people } = await listAccessPeople(await resolveDashboardViewer(adminA()))
    expect(people).toHaveLength(4)
    expect(people.every((p) => p.agencyId === db.ids.a)).toBe(true)
  })
})
