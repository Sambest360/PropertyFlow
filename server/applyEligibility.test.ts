import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./entityMap.js', () => ({
  isUuid: (id: string | null | undefined) =>
    typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  resolveUuid: vi.fn(async () => null),
}))

const UNIT = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'
const OTHER_CLIENT = '33333333-3333-4333-8333-333333333333'
const AGENT = '44444444-4444-4444-8444-444444444444'
const OTHER_AGENT = '55555555-5555-4555-8555-555555555555'
const BOOKING = '66666666-6666-4666-8666-666666666666'
const APPLICANT = '77777777-7777-4777-8777-777777777777'

function unitContext(patch: Record<string, unknown> = {}) {
  return {
    unit_id: UNIT,
    client_id: CLIENT,
    building_id: '88888888-8888-4888-8888-888888888888',
    listing_type: 'RENT',
    require_viewing_to_apply: null,
    settings: { requireViewingToApply: true },
    completed_bookings: [],
    live_override: null,
    ...patch,
  }
}

describe('apply eligibility loader', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('returns 403 VIEWING_REQUIRED when the unit has no completed booking', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('/* apply-eligibility */')) return [unitContext()]
      return []
    })
    const { viewingEvidenceForNewApplication } = await import('./applyEligibility.js')
    await expect(
      viewingEvidenceForNewApplication({
        unitId: UNIT,
        applicationType: 'RENTAL',
        actorRole: 'tenant',
        applicantId: null,
        applicantEmail: 'e2e-tenant@example.com',
        applicantPhone: null,
      }),
    ).rejects.toMatchObject({ status: 403, code: 'VIEWING_REQUIRED' })
  })

  it('stores the completed booking, including a virtual viewing', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('/* apply-eligibility */')) {
        return [
          unitContext({
            completed_bookings: [
              {
                id: BOOKING,
                unitId: UNIT,
                viewingMode: 'VIRTUAL',
                visitorEmail: 'e2e-tenant@example.com',
                attendedAt: '2026-11-12T08:00:00.000Z',
                attendedBy: '44444444-4444-4444-8444-444444444444',
              },
            ],
          }),
        ]
      }
      return []
    })
    const { viewingEvidenceForNewApplication } = await import('./applyEligibility.js')
    const gate = await viewingEvidenceForNewApplication({
      unitId: UNIT,
      applicationType: 'RENTAL',
      actorRole: 'tenant',
      applicantId: null,
      applicantEmail: 'e2e-tenant@example.com',
      applicantPhone: null,
    })
    expect(gate.bookingId).toBe(BOOKING)
    expect(gate.evidence?.kind).toBe('virtual')
  })

  it('stores an override id and ignores a missing live override', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('/* apply-eligibility */')) {
        return [
          unitContext({
            live_override: {
              id: '99999999-9999-4999-8999-999999999999',
              reasonCode: 'OUT_OF_TOWN',
              reasonText: 'E2E TEST',
            },
          }),
        ]
      }
      return []
    })
    const { viewingEvidenceForNewApplication } = await import('./applyEligibility.js')
    const gate = await viewingEvidenceForNewApplication({
      unitId: UNIT,
      applicationType: 'RENTAL',
      actorRole: 'tenant',
      applicantId: null,
      applicantEmail: 'e2e-tenant@example.com',
      applicantPhone: null,
    })
    expect(gate.overrideId).toBe('99999999-9999-4999-8999-999999999999')
    expect(gate.bookingId).toBeNull()
  })

  it('turns the rule off when the unit flag is false and follows the agency when the unit flag is null', async () => {
    const { viewingEvidenceForNewApplication } = await import('./applyEligibility.js')
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('/* apply-eligibility */')) return [unitContext({ require_viewing_to_apply: false })]
      return []
    })
    const off = await viewingEvidenceForNewApplication({
      unitId: UNIT,
      applicationType: 'RENTAL',
      actorRole: 'tenant',
      applicantId: null,
      applicantEmail: 'e2e-tenant@example.com',
      applicantPhone: null,
    })
    expect(off.bookingId).toBeNull()

    query.mockImplementation(async (sql: string) => {
      if (sql.includes('/* apply-eligibility */')) {
        return [unitContext({ settings: { requireViewingToApply: false } })]
      }
      return []
    })
    const agencyOff = await viewingEvidenceForNewApplication({
      unitId: UNIT,
      applicationType: 'RENTAL',
      actorRole: 'tenant',
      applicantId: null,
      applicantEmail: 'e2e-tenant@example.com',
      applicantPhone: null,
    })
    expect(agencyOff.evidence).toBeNull()
  })

  it('lets sale and purchase applications through', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('/* apply-eligibility */')) return [unitContext({ listing_type: 'SALE' })]
      return []
    })
    const { viewingEvidenceForNewApplication } = await import('./applyEligibility.js')
    const sale = await viewingEvidenceForNewApplication({
      unitId: UNIT,
      applicationType: 'RENTAL',
      actorRole: 'tenant',
      applicantId: null,
      applicantEmail: 'e2e-tenant@example.com',
      applicantPhone: null,
    })
    expect(sale.bookingId).toBeNull()
    const purchase = await viewingEvidenceForNewApplication({
      unitId: UNIT,
      applicationType: 'PURCHASE',
      actorRole: 'tenant',
      applicantId: null,
      applicantEmail: 'e2e-tenant@example.com',
      applicantPhone: null,
    })
    expect(purchase.evidence).toBeNull()
  })
})

describe('attendance and override routes logic', () => {
  beforeEach(() => {
    query.mockReset()
  })

  function attendanceQuery(options: { role: string; clientId: string; startsAt: string; agentId: string | null }) {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('/* booking-attendance */')) {
        return [
          {
            id: BOOKING,
            client_id: CLIENT,
            agent_id: options.agentId,
            applicant_id: APPLICANT,
            starts_at: options.startsAt,
            unit_id: UNIT,
            unit_agent_id: options.agentId,
          },
        ]
      }
      if (sql.includes('/* attendance-actor */')) {
        return [{ id: AGENT, client_id: options.clientId, role: options.role }]
      }
      if (sql.includes('UPDATE bookings')) return []
      if (sql.includes('INSERT INTO')) return []
      return []
    })
  }

  it('refuses another agency, a future start, and an unassigned agent', async () => {
    const { markBookingAttendance } = await import('./applyEligibility.js')
    attendanceQuery({ role: 'AGENT_ADMIN', clientId: OTHER_CLIENT, startsAt: '2020-01-01T00:00:00.000Z', agentId: AGENT })
    await expect(
      markBookingAttendance(
        { userId: AGENT, role: 'agent_admin', agencyId: OTHER_CLIENT },
        BOOKING,
        { status: 'COMPLETED' },
      ),
    ).rejects.toMatchObject({ status: 403 })

    attendanceQuery({ role: 'AGENT_ADMIN', clientId: CLIENT, startsAt: '2099-01-01T00:00:00.000Z', agentId: AGENT })
    await expect(
      markBookingAttendance({ userId: AGENT, role: 'agent_admin', agencyId: CLIENT }, BOOKING, { status: 'COMPLETED' }),
    ).rejects.toMatchObject({ status: 403, code: 'ATTENDANCE_TOO_EARLY' })

    attendanceQuery({
      role: 'AGENT_ADMIN',
      clientId: CLIENT,
      startsAt: '2020-01-01T00:00:00.000Z',
      agentId: OTHER_AGENT,
    })
    await expect(
      markBookingAttendance({ userId: AGENT, role: 'agent_admin', agencyId: CLIENT }, BOOKING, { status: 'COMPLETED' }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('lets an agency admin mark attendance', async () => {
    attendanceQuery({ role: 'AGENCY_ADMIN', clientId: CLIENT, startsAt: '2020-01-01T00:00:00.000Z', agentId: OTHER_AGENT })
    const { markBookingAttendance } = await import('./applyEligibility.js')
    const result = await markBookingAttendance(
      { userId: AGENT, role: 'client_admin', agencyId: CLIENT },
      BOOKING,
      { status: 'COMPLETED', viewingMode: 'IN_PERSON' },
    )
    expect(result.status).toBe('COMPLETED')
    expect(query.mock.calls.some((call) => String(call[0]).includes('viewing_attendance_marked'))).toBe(true)
  })

  it('rejects an override without a reason and stores one with a reason', async () => {
    const { grantApplyOverride } = await import('./applyEligibility.js')
    await expect(
      grantApplyOverride({ userId: AGENT, role: 'client_admin', agencyId: CLIENT }, UNIT, {
        applicantEmail: 'e2e-tenant@example.com',
        reasonCode: 'OUT_OF_TOWN',
        reasonText: ' ',
      }),
    ).rejects.toMatchObject({ status: 400, code: 'OVERRIDE_REASON_REQUIRED' })

    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM units WHERE id')) return [{ id: UNIT, client_id: CLIENT, agent_id: AGENT }]
      if (sql.includes('/* attendance-actor */')) return [{ id: AGENT, client_id: CLIENT, role: 'AGENCY_ADMIN' }]
      if (sql.includes('INSERT INTO apply_overrides')) return [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }]
      return []
    })
    const granted = await grantApplyOverride(
      { userId: AGENT, role: 'client_admin', agencyId: CLIENT },
      UNIT,
      {
        applicantEmail: 'e2e-tenant@example.com',
        reasonCode: 'OUT_OF_TOWN',
        reasonText: 'E2E TEST travelling',
      },
    )
    expect(granted.id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    const insert = query.mock.calls.find((call) => String(call[0]).includes('INSERT INTO apply_overrides'))
    expect(insert?.[1]?.[5]).toBe('OUT_OF_TOWN')
  })

  it('revokes active overrides when the unit is let', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE apply_overrides')) {
        return [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', client_id: CLIENT }]
      }
      return []
    })
    const { revokeApplyOverridesForLetStatus } = await import('./applyEligibility.js')
    await revokeApplyOverridesForLetStatus(UNIT, 'OCCUPIED')
    expect(query.mock.calls.some((call) => String(call[0]).includes('SET revoked_at'))).toBe(true)
    expect(query.mock.calls.some((call) => String(call[0]).includes('apply_override_revoked'))).toBe(true)
    query.mockClear()
    await revokeApplyOverridesForLetStatus(UNIT, 'AVAILABLE')
    expect(query).not.toHaveBeenCalled()
  })
})

describe('viewing gate hardening (PR 1 fixes)', () => {
  const OTHER_PHONE = '0821112222'
  const markedBooking = (patch: Record<string, unknown> = {}) => ({
    id: BOOKING,
    unitId: UNIT,
    viewingMode: 'IN_PERSON',
    applicantId: '99999999-9999-4999-8999-999999999990',
    visitorEmail: 'someone-else@example.com',
    visitorPhone: OTHER_PHONE,
    attendedAt: '2026-11-12T08:00:00.000Z',
    attendedBy: AGENT,
    ...patch,
  })

  function mockRows(ctx: Record<string, unknown>, user: { email: string | null; phone: string | null } | null) {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('/* apply-eligibility */')) return [unitContext(ctx)]
      if (sql.includes('FROM users WHERE id')) return user ? [user] : []
      return []
    })
  }

  beforeEach(() => {
    query.mockReset()
  })

  it("does not unlock when the applicant types someone else's phone and the account has none", async () => {
    mockRows({ completed_bookings: [markedBooking()] }, { email: 'e2e-tenant@example.com', phone: null })
    const { viewingEvidenceForNewApplication } = await import('./applyEligibility.js')
    await expect(
      viewingEvidenceForNewApplication({
        unitId: UNIT,
        applicationType: 'RENTAL',
        actorRole: 'tenant',
        applicantId: APPLICANT,
        applicantEmail: 'e2e-tenant@example.com',
        applicantPhone: OTHER_PHONE,
      }),
    ).rejects.toMatchObject({ status: 403, code: 'VIEWING_REQUIRED' })
  })

  it("does not unlock on a typed email of someone else's booking when signed in", async () => {
    mockRows({ completed_bookings: [markedBooking()] }, { email: 'e2e-tenant@example.com', phone: null })
    const { viewingEvidenceForNewApplication } = await import('./applyEligibility.js')
    await expect(
      viewingEvidenceForNewApplication({
        unitId: UNIT,
        applicationType: 'RENTAL',
        actorRole: 'tenant',
        applicantId: APPLICANT,
        applicantEmail: 'someone-else@example.com',
        applicantPhone: null,
      }),
    ).rejects.toMatchObject({ code: 'VIEWING_REQUIRED' })
  })

  it("still unlocks on the account's own phone", async () => {
    mockRows({ completed_bookings: [markedBooking()] }, { email: 'e2e-tenant@example.com', phone: OTHER_PHONE })
    const { viewingEvidenceForNewApplication } = await import('./applyEligibility.js')
    const gate = await viewingEvidenceForNewApplication({
      unitId: UNIT,
      applicationType: 'RENTAL',
      actorRole: 'tenant',
      applicantId: APPLICANT,
      applicantEmail: null,
      applicantPhone: null,
    })
    expect(gate.bookingId).toBe(BOOKING)
  })

  it('ignores a typed phone for a walk-in without an account', async () => {
    mockRows({ completed_bookings: [markedBooking()] }, null)
    const { viewingEvidenceForNewApplication } = await import('./applyEligibility.js')
    await expect(
      viewingEvidenceForNewApplication({
        unitId: UNIT,
        applicationType: 'RENTAL',
        actorRole: 'tenant',
        applicantId: null,
        applicantEmail: 'walk-in@example.com',
        applicantPhone: OTHER_PHONE,
      }),
    ).rejects.toMatchObject({ code: 'VIEWING_REQUIRED' })
  })

  it('does not count a COMPLETED booking whose attendance was never marked by staff', async () => {
    mockRows(
      {
        completed_bookings: [
          markedBooking({ visitorEmail: 'e2e-tenant@example.com', attendedBy: null, attendedAt: null }),
        ],
      },
      null,
    )
    const { viewingEvidenceForNewApplication } = await import('./applyEligibility.js')
    await expect(
      viewingEvidenceForNewApplication({
        unitId: UNIT,
        applicationType: 'RENTAL',
        actorRole: 'tenant',
        applicantId: null,
        applicantEmail: 'e2e-tenant@example.com',
        applicantPhone: null,
      }),
    ).rejects.toMatchObject({ code: 'VIEWING_REQUIRED' })
    const sql = String(query.mock.calls.find((call) => String(call[0]).includes('/* apply-eligibility */'))?.[0])
    expect(sql).toContain('b.attended_marked_by IS NOT NULL')
  })

  it('applies no gate when the agency has no viewing setting, unless the unit opts in', async () => {
    mockRows({ settings: {} }, null)
    const { viewingEvidenceForNewApplication } = await import('./applyEligibility.js')
    const open = await viewingEvidenceForNewApplication({
      unitId: UNIT,
      applicationType: 'RENTAL',
      actorRole: 'tenant',
      applicantId: null,
      applicantEmail: 'e2e-tenant@example.com',
      applicantPhone: null,
    })
    expect(open).toEqual({ bookingId: null, overrideId: null, evidence: null })

    mockRows({ settings: null }, null)
    await expect(
      viewingEvidenceForNewApplication({
        unitId: UNIT,
        applicationType: 'RENTAL',
        actorRole: 'tenant',
        applicantId: null,
        applicantEmail: 'e2e-tenant@example.com',
        applicantPhone: null,
      }),
    ).resolves.toMatchObject({ evidence: null })

    mockRows({ settings: {}, require_viewing_to_apply: true }, null)
    await expect(
      viewingEvidenceForNewApplication({
        unitId: UNIT,
        applicationType: 'RENTAL',
        actorRole: 'tenant',
        applicantId: null,
        applicantEmail: 'e2e-tenant@example.com',
        applicantPhone: null,
      }),
    ).rejects.toMatchObject({ code: 'VIEWING_REQUIRED' })
  })
})
