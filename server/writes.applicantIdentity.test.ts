import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Security: applicant identity hardening (Angela, PR #109 follow-ups).
 * (a) A typed email never picks the applicant's account: tenants and
 *     contractors apply as their own account only; staff pick a real account
 *     id. linkUserFeToUuid is never reached from an application write.
 * (b) The viewing gate runs once, in the write, on the resolved account, and
 *     fails closed; the applicant policy no longer runs a swallowing pre-check.
 */

const query = vi.hoisted(() => vi.fn())
const resolveUuid = vi.hoisted(() => vi.fn())
const ensureUuid = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(async (fn: (q: typeof query) => Promise<unknown>) => fn(query)),
  clientQuery: (...args: unknown[]) => query(...args),
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

const UNIT = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'
const APP = '33333333-3333-4333-8333-333333333333'
const STAFF = '44444444-4444-4444-8444-444444444444'
const VICTIM_BOOKING = '66666666-6666-4666-8666-666666666666'
/** The signed-in tenant. */
const ME = '77777777-7777-4777-8777-777777777777'
/** Someone else, whose email the tenant types into the form. */
const VICTIM = '88888888-8888-4888-8888-888888888888'

const ACCOUNTS: Record<string, { email: string; phone: string | null }> = {
  [ME]: { email: 'me@example.com', phone: null },
  [VICTIM]: { email: 'victim@example.com', phone: '0820000000' },
}
/** Front-end ids in the id map. */
const MAP: Record<string, string> = { 'u-me': ME, 'u-victim': VICTIM }

let eligibilityError: Error | null = null
let gateOn = true

function sqlCalls(): string[] {
  return query.mock.calls.map((c) => String(c[0]))
}
function applicationInsert(): unknown[] | null {
  const call = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO applications'))
  return call ? (call[1] as unknown[]) : null
}
function emailLookups(): number {
  return sqlCalls().filter((s) => s.includes('LOWER(TRIM(email))')).length
}
function userMapLinks(): unknown[][] {
  return query.mock.calls.filter(
    (c) => String(c[0]).includes('INSERT INTO entity_id_map') && String(c[0]).includes("VALUES ('user'"),
  )
}

async function apply(actorUserId: string | null, actorRole: string | null, data: Record<string, unknown>) {
  const { handlePersist } = await import('./writes.js')
  return handlePersist(
    {
      resource: 'application',
      action: 'upsert',
      id: 'APP-ID-1',
      data: { propertyId: 'PR-9001', applicantName: 'Applicant', type: 'Rental', ...data },
    },
    actorUserId,
    actorRole,
  )
}

beforeEach(() => {
  eligibilityError = null
  gateOn = true
  query.mockReset()
  resolveUuid.mockReset()
  ensureUuid.mockReset()
  resolveUuid.mockImplementation(async (et: string, fe: string) => {
    if (et === 'user') return MAP[fe] ?? null
    if (et === 'agency') return CLIENT
    return null
  })
  ensureUuid.mockImplementation(async () => APP)
  query.mockImplementation(async (sql: string, params?: unknown[]) => {
    const p0 = String(params?.[0] ?? '')
    if (/SELECT id::text AS id FROM users WHERE id = \$1::uuid/.test(sql)) return ACCOUNTS[p0] ? [{ id: p0 }] : []
    if (/SELECT email, phone FROM users WHERE id = \$1::uuid/.test(sql)) return ACCOUNTS[p0] ? [ACCOUNTS[p0]] : []
    // A typed-email lookup would find the victim: the hardened code must never ask.
    if (sql.includes('LOWER(TRIM(email))')) return [{ id: VICTIM }]
    if (sql.includes('/* apply-eligibility */')) {
      if (eligibilityError) throw eligibilityError
      return [
        {
          unit_id: UNIT,
          client_id: CLIENT,
          building_id: null,
          listing_type: 'RENT',
          require_viewing_to_apply: null,
          settings: gateOn ? { requireViewingToApply: true } : {},
          // Only the victim attended a viewing (staff-marked), under their own account.
          completed_bookings: [
            {
              id: VICTIM_BOOKING,
              unitId: UNIT,
              viewingMode: 'IN_PERSON',
              applicantId: VICTIM,
              visitorEmail: 'victim@example.com',
              visitorPhone: '0820000000',
              attendedAt: '2026-10-01T08:00:00.000Z',
              attendedBy: STAFF,
            },
          ],
          live_override: null,
        },
      ]
    }
    if (sql.includes('FROM applications WHERE id')) return []
    if (sql.includes('FROM entity_id_map m') && sql.includes('JOIN units')) {
      return [{ id: UNIT, backend_id: UNIT, unit_client: CLIENT, building_client: CLIENT }]
    }
    return []
  })
})

afterEach(() => {
  vi.resetModules()
})

describe('(a) a typed email never attaches an application to someone else', () => {
  it("a tenant typing someone else's email applies as themselves, with no email lookup or id-map link", async () => {
    gateOn = false
    await apply('u-me', 'tenant', { applicantUserId: 'u-me', email: 'victim@example.com' })
    expect(applicationInsert()?.[3]).toBe(ME)
    expect(emailLookups()).toBe(0)
    expect(userMapLinks()).toEqual([])
  })

  it("the viewing gate uses the tenant's own account, not the typed email's viewing", async () => {
    await expect(
      apply('u-me', 'tenant', { applicantUserId: 'u-me', email: 'victim@example.com', phone: '0820000000' }),
    ).rejects.toMatchObject({ status: 403, code: 'VIEWING_REQUIRED' })
    expect(applicationInsert()).toBeNull()
    const contactReads = query.mock.calls.filter((c) => /SELECT email, phone FROM users/.test(String(c[0])))
    expect(contactReads.map((c) => (c[1] as unknown[])[0])).toEqual([ME])
  })

  it('a tenant whose own account does not resolve is refused (no fallback to the typed email)', async () => {
    gateOn = false
    await expect(
      apply('u-unmapped', 'tenant', { applicantUserId: 'u-unmapped', email: 'victim@example.com' }),
    ).rejects.toMatchObject({ status: 403, code: 'APPLICANT_ACCOUNT_UNRESOLVED' })
    expect(applicationInsert()).toBeNull()
    expect(emailLookups()).toBe(0)
    expect(userMapLinks()).toEqual([])
  })

  it('a contractor is held to the same rule', async () => {
    gateOn = false
    await expect(
      apply('u-unmapped', 'contractor', { applicantUserId: 'u-unmapped', email: 'victim@example.com' }),
    ).rejects.toMatchObject({ code: 'APPLICANT_ACCOUNT_UNRESOLVED' })
    expect(userMapLinks()).toEqual([])
  })

  it("a tenant naming someone else's account id is refused", async () => {
    gateOn = false
    await expect(apply('u-me', 'tenant', { applicantUserId: 'u-victim' })).rejects.toMatchObject({
      status: 403,
      code: 'APPLICANT_NOT_SELF',
    })
    expect(applicationInsert()).toBeNull()
  })

  it('staff picking a real account id attach that account', async () => {
    gateOn = false
    await apply('u-staff', 'client_admin', { applicantUserId: 'u-victim', email: 'other@example.com' })
    expect(applicationInsert()?.[3]).toBe(VICTIM)
    expect(emailLookups()).toBe(0)
  })

  it('staff typing only an email save a walk-in with no linked account', async () => {
    gateOn = false
    await apply('u-staff', 'agent_admin', { email: 'victim@example.com' })
    expect(applicationInsert()?.[3]).toBeNull()
    expect(emailLookups()).toBe(0)
    expect(userMapLinks()).toEqual([])
  })

  it('an unmapped applicantUserId plus a typed email is not linked to the email owner (linkUserFeToUuid not called)', async () => {
    gateOn = false
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await apply('u-staff', 'client_admin', { applicantUserId: 'u-typed-fe', email: 'victim@example.com' })
    expect(applicationInsert()?.[3]).toBeNull()
    expect(emailLookups()).toBe(0)
    expect(userMapLinks()).toEqual([])
    // linkUserFeToUuid's first step is this id-map read; it never runs.
    expect(sqlCalls().some((s) => s.includes("WHERE entity_type = 'user' AND frontend_id = $1"))).toBe(false)
  })
})

describe('(b) the viewing gate fails closed and is not pre-checked with a swallowed error', () => {
  it('a database error in the gate refuses the application instead of letting it through', async () => {
    eligibilityError = Object.assign(new Error('invalid input syntax for type uuid: "u-me"'), { code: '22P02' })
    await expect(apply('u-me', 'tenant', { applicantUserId: 'u-me' })).rejects.toThrow(/invalid input syntax/)
    expect(applicationInsert()).toBeNull()
  })

  it('the gate runs once per create, on the resolved account uuid', async () => {
    gateOn = false
    await apply('u-me', 'tenant', { applicantUserId: 'u-me' })
    const gateCalls = query.mock.calls.filter((c) => String(c[0]).includes('/* apply-eligibility */'))
    expect(gateCalls).toHaveLength(1)
    expect((gateCalls[0]![1] as unknown[])[1]).toBe(ME)
  })

  it('the applicant policy no longer runs its own eligibility pre-check', async () => {
    const { enforceApplicantApplicationWrite } = await import('./applicantApplicationPolicy.js')
    eligibilityError = new Error('must not be called')
    await enforceApplicantApplicationWrite(
      { userId: 'u-me', role: 'tenant', agencyId: null } as never,
      'APP-ID-2',
      { propertyId: 'PR-9001', type: 'Rental' },
      false,
    )
    expect(sqlCalls().some((s) => s.includes('/* apply-eligibility */'))).toBe(false)
  })
})
