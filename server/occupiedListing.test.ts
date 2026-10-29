import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DemoActor } from './actor.js'
import { isSaPublicHoliday, saBusinessDaysBetween } from './saPublicHolidays.js'
import {
  AVAILABLE_FROM_REQUIRED,
  LEASE_OVERLAP,
  NOTICE_TOO_SHORT,
  OUTSIDE_VIEWING_WINDOW,
  PUBLIC_OCCUPIED_ADVERT_SQL,
  PUBLIC_UNIT_FORBIDDEN_KEYS,
  assertNoLeaseOverlap,
  assertOccupiedBookingAllowed,
  computeAvailableFrom,
  computeNoticeEndDate,
  leaseOverlapFromDbError,
  listTenantViewingRequests,
  patchAdvertiseWhileOccupied,
  postLeaseNotice,
  shouldClearAdvert,
  syncAdvertAfterLeaseSave,
  type OccupiedDeps,
} from './occupiedListing.js'

const MIGRATION = readFileSync('database/postgres/migrations/027_advertise_while_occupied.sql', 'utf8')

const CLIENT = '00000000-0000-4000-8000-0000000000a1'
const UNIT = '00000000-0000-4000-8000-0000000000b1'
const LEASE = '00000000-0000-4000-8000-0000000000c1'
const TENANT = '00000000-0000-4000-8000-000000000105'
const APPLICANT = '00000000-0000-4000-8000-000000000106'

const agent: DemoActor = { role: 'agent_admin', userId: 'U-e2e-agent', agencyId: 'AG-e2e' } as DemoActor
const tenant: DemoActor = { role: 'tenant', userId: 'U-e2e-tenant', agencyId: null } as DemoActor

type Call = { sql: string; params: unknown[] }

/** Scripted fake: the first route whose needle is in the SQL answers. */
function fakeDeps(
  routes: Array<[string, (params: unknown[]) => Record<string, unknown>[]]>,
  overrides: Partial<OccupiedDeps> = {},
): OccupiedDeps & { calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    query: async (sql, params = []) => {
      calls.push({ sql, params })
      const hit = routes.find(([needle]) => sql.includes(needle))
      return hit ? hit[1](params) : []
    },
    resolveUuid: async (type, id) => (type === 'user' && id === tenant.userId ? TENANT : null),
    assertUnitManageable: async () => ({ clientId: CLIENT }),
    canPublish: async () => true,
    now: () => new Date('2027-02-01T08:00:00Z'),
    ...overrides,
  }
}

/** Keys of the jsonb_build_object in public_listing_unit_json (migration 027). */
function publicUnitKeys(): string[] {
  const start = MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public_listing_unit_json')
  const body = MIGRATION.slice(start, MIGRATION.indexOf('$$;', start))
  return [...body.matchAll(/^\s+'([a-z_]+)',\s*u\./gm)].map((m) => m[1])
}

describe('available from', () => {
  it('lease ending 31 Jan with 1 turnover day is available 1 Feb, stored on the unit', async () => {
    expect(
      computeAvailableFrom({ status: 'ACTIVE', endDate: '2027-01-31', noticeEndDate: null, turnoverDays: 1 }),
    ).toEqual({ availableFrom: '2027-02-01', reason: 'Lease ends 31 Jan 2027' })

    const deps = fakeDeps([
      [
        'FROM units u\n       JOIN clients c',
        () => [{ status: 'ACTIVE', end_date: '2027-01-31', notice_end_date: null, tenant_id: TENANT, settings: { turnoverDays: 1 } }],
      ],
    ])
    const result = await patchAdvertiseWhileOccupied(agent, UNIT, { enabled: true }, deps)
    expect(result).toMatchObject({ advertiseWhileOccupied: true, availableFrom: '2027-02-01' })
    const update = deps.calls.find((c) => c.sql.startsWith('UPDATE units SET advertise_while_occupied = true'))
    expect(update?.params).toEqual([UNIT, '2027-02-01'])
    const notice = deps.calls.find((c) => c.sql.includes('INSERT INTO notifications'))
    expect(notice?.params[1]).toBe(TENANT)
  })

  it('a month-to-month lease with no notice needs an expected date and a reason', async () => {
    const deps = fakeDeps([
      ['FROM units u\n       JOIN clients c', () => [{ status: 'ACTIVE', end_date: null, notice_end_date: null, settings: {} }]],
    ])
    await expect(patchAdvertiseWhileOccupied(agent, UNIT, { enabled: true }, deps)).rejects.toMatchObject({
      status: 400,
      code: AVAILABLE_FROM_REQUIRED,
    })
    await expect(
      patchAdvertiseWhileOccupied(agent, UNIT, { enabled: true, expectedAvailableFrom: '2027-03-01' }, deps),
    ).rejects.toMatchObject({ code: AVAILABLE_FROM_REQUIRED })
    const ok = await patchAdvertiseWhileOccupied(
      agent,
      UNIT,
      { enabled: true, expectedAvailableFrom: '2027-03-01', reason: 'E2E TEST tenant relocating' },
      deps,
    )
    expect(ok).toMatchObject({ availableFrom: '2027-03-01', reason: 'E2E TEST tenant relocating' })
  })

  it('an agent without listings.publish cannot advertise', async () => {
    const deps = fakeDeps([], { canPublish: async () => false })
    await expect(patchAdvertiseWhileOccupied(agent, UNIT, { enabled: true }, deps)).rejects.toMatchObject({ status: 403 })
  })
})

describe('viewing an occupied home', () => {
  const occupiedUnit: [string, () => Record<string, unknown>[]] = [
    'FROM units WHERE id',
    () => [{ advertise_while_occupied: true, status_config_key: 'OCCUPIED', occupied_viewing_notice_hours: 24 }],
  ]
  // Monday 2027-02-01 is weekday 1; the tenant hosts Mondays 10:00-12:00.
  const windows: [string, () => Record<string, unknown>[]] = [
    'FROM tenant_viewing_windows',
    () => [{ weekday: 1, window_date: null, start_time: '10:00', end_time: '12:00' }],
  ]

  it('a booking 10 hours ahead is 400 NOTICE_TOO_SHORT', async () => {
    const deps = fakeDeps([occupiedUnit, windows])
    await expect(
      assertOccupiedBookingAllowed(
        UNIT,
        { date: '2027-02-01', time: '18:00', startsAt: new Date('2027-02-01T18:00:00Z') },
        deps,
      ),
    ).rejects.toMatchObject({ status: 400, code: NOTICE_TOO_SHORT })
  })

  it('a booking outside the tenant window is 400; inside it waits for the tenant', async () => {
    const deps = fakeDeps([occupiedUnit, windows])
    await expect(
      assertOccupiedBookingAllowed(
        UNIT,
        { date: '2027-02-03', time: '09:00', startsAt: new Date('2027-02-03T09:00:00Z') },
        deps,
      ),
    ).rejects.toMatchObject({ status: 400, code: OUTSIDE_VIEWING_WINDOW })
    await expect(
      assertOccupiedBookingAllowed(
        UNIT,
        { date: '2027-02-08', time: '10:30', startsAt: new Date('2027-02-08T10:30:00Z') },
        deps,
      ),
    ).resolves.toBe('PENDING')
    // Windows come from the sitting tenant's lease only.
    expect(deps.calls.find((c) => c.sql.includes('FROM tenant_viewing_windows'))?.sql).toContain(
      "l.status IN ('ACTIVE', 'NOTICE')",
    )
  })

  it('a unit that is not an occupied advert books as before', async () => {
    const deps = fakeDeps([
      ['FROM units WHERE id', () => [{ advertise_while_occupied: false, status_config_key: 'AVAILABLE' }]],
    ])
    await expect(
      assertOccupiedBookingAllowed(UNIT, { date: '2027-02-01', time: '09:00', startsAt: new Date('2027-02-01T09:00:00Z') }, deps),
    ).resolves.toBe('NOT_REQUIRED')
  })
})

describe('successor lease', () => {
  const run = async (sql: string) => {
    if (sql.includes('FROM units')) return [{ available_from: '2027-02-01' }]
    if (sql.includes('FROM leases')) return [{ id: LEASE, start_date: '2026-02-01', end_date: '2027-01-31' }]
    return []
  }

  it('move-in 15 Jan is 409 LEASE_OVERLAP; 1 Feb is allowed', async () => {
    await expect(assertNoLeaseOverlap(run, UNIT, '2027-01-15', '2028-01-14')).rejects.toMatchObject({
      status: 409,
      code: LEASE_OVERLAP,
    })
    await expect(assertNoLeaseOverlap(run, UNIT, '2027-02-01', '2028-01-31')).resolves.toBeUndefined()
  })

  it('maps the leases_no_date_overlap exclusion error to 409 LEASE_OVERLAP', () => {
    expect(leaseOverlapFromDbError({ code: '23P01', constraint: 'leases_no_date_overlap' })).toMatchObject({
      status: 409,
      code: LEASE_OVERLAP,
    })
    expect(leaseOverlapFromDbError({ code: '23505', constraint: 'leases_pkey' })).toBeNull()
  })
})

describe('notice', () => {
  it('tenant notice on a fixed term ends 20 SA business days later, skipping holidays', async () => {
    // 14 Dec 2026: 16 Dec, 25 Dec and 1 Jan fall inside the 20 business days.
    const noticeEnd = computeNoticeEndDate({ givenAt: '2026-12-14', endDate: '2027-06-30' })
    expect(noticeEnd).toBe('2027-01-14')
    expect(saBusinessDaysBetween('2026-12-14', noticeEnd)).toBe(20)
    expect(isSaPublicHoliday(noticeEnd)).toBe(false)

    const deps = fakeDeps([
      [
        'FROM leases l\n       JOIN units u',
        () => [
          {
            client_id: CLIENT,
            unit_id: UNIT,
            tenant_id: TENANT,
            status: 'ACTIVE',
            end_date: '2027-06-30',
            metadata: {},
            advertise_while_occupied: true,
            settings: { turnoverDays: 1 },
          },
        ],
      ],
    ])
    const result = await postLeaseNotice(tenant, LEASE, { givenBy: 'TENANT', givenAt: '2026-12-14' }, deps)
    expect(result).toEqual({ noticeEndDate: '2027-01-14', status: 'NOTICE', availableFrom: '2027-01-15' })
    const update = deps.calls.find((c) => c.sql.startsWith("UPDATE leases SET status = 'NOTICE'"))
    expect(update?.params).toEqual([LEASE, '2026-12-14', 'TENANT', '2027-01-14', '2027-06-30'])
  })

  it('month-to-month notice is one calendar month; notice never runs past the lease end', () => {
    expect(computeNoticeEndDate({ givenAt: '2027-01-15', endDate: null })).toBe('2027-02-15')
    expect(computeNoticeEndDate({ givenAt: '2027-01-31', endDate: null })).toBe('2027-02-28')
    expect(computeNoticeEndDate({ givenAt: '2027-01-04', endDate: '2027-01-20' })).toBe('2027-01-20')
  })

  it('another tenant cannot give notice on the lease', async () => {
    const deps = fakeDeps([
      ['FROM leases l\n       JOIN units u', () => [{ client_id: CLIENT, unit_id: UNIT, tenant_id: APPLICANT, status: 'ACTIVE' }]],
    ])
    await expect(postLeaseNotice(tenant, LEASE, { givenBy: 'TENANT', givenAt: '2026-12-14' }, deps)).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe('advert follows the lease', () => {
  it('a renewal unlists the unit and tells pending applicants', async () => {
    const deps = fakeDeps([
      ['SELECT advertise_while_occupied FROM units', () => [{ advertise_while_occupied: true }]],
      ['UPDATE units SET advertise_while_occupied = false', () => [{ client_id: CLIENT }]],
      ['FROM applications', () => [{ applicant_id: APPLICANT }]],
    ])
    await syncAdvertAfterLeaseSave(
      { unitId: UNIT, previousStatus: 'ACTIVE', previousEnd: '2027-01-31', nextStatus: 'ACTIVE', nextEnd: '2028-01-31' },
      deps,
    )
    expect(deps.calls.some((c) => c.sql.includes('UPDATE units SET advertise_while_occupied = false'))).toBe(true)
    const event = deps.calls.find((c) => c.sql.includes('INSERT INTO event_log'))
    expect(JSON.parse(String(event?.params[5]))).toEqual({ reason: 'lease renewed' })
    const notice = deps.calls.find((c) => c.sql.includes('INSERT INTO notifications'))
    expect(notice?.params[1]).toBe(APPLICANT)
  })

  it('a withdrawn notice unlists the unit', async () => {
    const deps = fakeDeps([
      ['SELECT advertise_while_occupied FROM units', () => [{ advertise_while_occupied: true }]],
      ['UPDATE units SET advertise_while_occupied = false', () => [{ client_id: CLIENT }]],
    ])
    await syncAdvertAfterLeaseSave(
      { unitId: UNIT, previousStatus: 'NOTICE', previousEnd: '2027-01-14', nextStatus: 'ACTIVE', nextEnd: '2027-01-14' },
      deps,
    )
    const event = deps.calls.find((c) => c.sql.includes('INSERT INTO event_log'))
    expect(JSON.parse(String(event?.params[5]))).toEqual({ reason: 'notice withdrawn' })
    expect(shouldClearAdvert({ advertising: false, noticeWithdrawn: true })).toBe(false)
  })
})

describe('public marketplace RPC (migration 027)', () => {
  it('units are built from explicit public keys with no tenant or lease PII', () => {
    const keys = publicUnitKeys()
    expect(keys).toContain('available_from')
    expect(keys).toContain('advertise_while_occupied')
    for (const bad of PUBLIC_UNIT_FORBIDDEN_KEYS) expect(keys).not.toContain(bad)
    // Neither RPC serialises a whole unit or user row any more.
    expect(MIGRATION).not.toMatch(/to_jsonb\(u\)/)
  })

  it('both RPCs keep the 024 listing-limit snapshot (fully_booked / remaining) and add occupied adverts', () => {
    const merged = MIGRATION.match(/public_listing_unit_json\(u\.id\) \|\| unit_listing_limit_snapshot\(u\.id\)/g) ?? []
    expect(merged).toHaveLength(2)
    // Two bootstrap RPCs, the enquiry RPC (which must accept the same adverts) and the
    // round 4 snapshot guard's public-listing branch (same rule as public_units).
    expect(MIGRATION.match(/u\.advertise_while_occupied = true\s+AND u\.available_from IS NOT NULL/g)).toHaveLength(4)
    expect(MIGRATION).toContain(PUBLIC_OCCUPIED_ADVERT_SQL.split('\n')[0])
    const snapshot = readFileSync('database/postgres/migrations/024_listing_lead_viewing_limits.sql', 'utf8')
    expect(snapshot).toContain("'fully_booked'")
    expect(snapshot).toContain("'remaining'")
  })

  it('keeps the btree_gist exclusion constraint on open leases', () => {
    expect(MIGRATION).toContain('CREATE EXTENSION IF NOT EXISTS btree_gist')
    expect(MIGRATION).toContain('ADD CONSTRAINT leases_no_date_overlap')
    expect(MIGRATION).toContain("WHERE (status IN ('PENDING', 'ACTIVE', 'NOTICE'))")
  })
})

describe('T9 (Angela r5): listTenantViewingRequests (occupiedListing.ts:594)', () => {
  it('asks only for SCHEDULED + PENDING rows after the SAST wall clock (stored as Z), oldest first', async () => {
    const deps = fakeDeps([
      ['FROM leases WHERE id', () => [{ id: LEASE, client_id: CLIENT, unit_id: UNIT, tenant_id: TENANT }]],
      ['FROM bookings', () => [{ id: 'b1', starts_at: '2027-02-01T14:00:00.000Z', tenant_consent_status: 'PENDING' }]],
    ], { resolveUuid: async (type, id) => (type === 'tenancy' ? LEASE : type === 'user' && id === tenant.userId ? TENANT : null) })
    const rows = await listTenantViewingRequests(tenant, 'L-1', deps)
    expect(rows).toEqual([{ id: 'b1', startsAt: '2027-02-01T14:00:00.000Z', tenantConsentStatus: 'PENDING' }])
    const call = deps.calls.find((x) => x.sql.includes('FROM bookings'))!
    const flat = call.sql.replace(/\s+/g, ' ')
    expect(flat).toContain("starts_at > (NOW() AT TIME ZONE 'Africa/Johannesburg') AT TIME ZONE 'UTC'")
    expect(flat).toContain("status = 'SCHEDULED' AND tenant_consent_status = 'PENDING'")
    expect(flat).toContain('ORDER BY starts_at')
    expect(flat).not.toMatch(/visitor_|email|phone/)
    expect(call.params).toEqual([UNIT])
  })

  it('refuses a caller who is not the lease tenant', async () => {
    const deps = fakeDeps([
      ['FROM leases WHERE id', () => [{ id: LEASE, client_id: CLIENT, unit_id: UNIT, tenant_id: APPLICANT }]],
    ], { resolveUuid: async (type, id) => (type === 'tenancy' ? LEASE : type === 'user' && id === tenant.userId ? TENANT : null) })
    await expect(listTenantViewingRequests(tenant, 'L-1', deps)).rejects.toThrow(/Forbidden/)
    expect(deps.calls.some((x) => x.sql.includes('FROM bookings'))).toBe(false)
    await expect(listTenantViewingRequests(agent, 'L-1', deps)).rejects.toThrow(/Forbidden/)
  })
})
