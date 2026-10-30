import { describe, expect, it } from 'vitest'
import { buildPropertyScope } from './scope'
import { filterBootstrapForActor, scopeApplicationIdNumbers } from './bootstrapActorFilter'
import { maskIdNumber } from './screening/consentTerms'

/**
 * T1 C6 / O5: the applicant's ID and the co-applicant / guarantor IDs on
 * creditCheckConsents go in full only to the listing agency's staff and the
 * applicant. Super admin, other agencies and every other role get
 * maskIdNumber or nothing.
 */
const MAIN_ID = '8001015009087'
const CO_ID = '9202024800081'
const GUARANTOR_ID = 'A12345678'

const app = {
  id: 'APP-1',
  propertyId: 'p-a1',
  agencyId: 'ag-a',
  agentId: 'u-james',
  applicantUserId: 'u-t',
  applicantName: 'Thandi Tenant',
  email: 'tenant@example.com',
  phone: '0821234567',
  idNumberOrPassport: MAIN_ID,
  employerName: 'Acme',
  jobTitle: 'Clerk',
  status: 'submitted',
  creditCheckConsents: {
    adults: [
      { id: 'main', name: 'Thandi Tenant', idNumber: MAIN_ID, consented: true },
      { id: 'co', name: 'Co Applicant', idNumber: CO_ID, consented: true },
      { id: 'g', name: 'Guarantor', idNumber: GUARANTOR_ID, consented: false },
    ],
  },
}

const raw = {
  source: 'test',
  fetchedAt: new Date().toISOString(),
  agencies: [
    { id: 'ag-a', status: 'Active' },
    { id: 'ag-b', status: 'Active' },
  ],
  users: [
    { id: 'u-t', email: 'Tenant@Example.com', name: 'Thandi Tenant', role: 'tenant' },
    { id: 'u-t2', email: 'other@example.com', name: 'Other Tenant', role: 'tenant' },
  ],
  buildings: [],
  units: [],
  properties: [
    { id: 'p-a1', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll' },
    { id: 'p-b1', agencyId: 'ag-b', agentId: 'u-x', landlordId: 'u-ll' },
  ],
  leads: [],
  applications: [app],
  tenancies: [],
  viewings: [],
  payments: [],
  propertyDocuments: [],
  tickets: [],
  threads: [],
  messages: [],
  notifications: [],
}

type Actor = { userId: string; role: string; agencyId: string | null }

function appsFor(actor: Actor, data: typeof raw = raw) {
  const scope = buildPropertyScope(
    { role: actor.role as never, userId: actor.userId, agencyId: actor.agencyId, agencySuspended: false },
    { properties: data.properties },
  )
  const out = filterBootstrapForActor(data as never, actor as never, scope)
  return out.applications as Array<Record<string, unknown>>
}

function idsOf(a: Record<string, unknown>) {
  const adults = ((a.creditCheckConsents as { adults?: Array<{ idNumber?: string }> } | null)?.adults ?? []).map(
    (x) => x.idNumber,
  )
  return { main: a.idNumberOrPassport, adults }
}

function fullIdsAnywhere(apps: Array<Record<string, unknown>>) {
  const s = JSON.stringify(apps)
  return [MAIN_ID, CO_ID, GUARANTOR_ID].filter((id) => s.includes(id))
}

describe('T1 C6/O5: application ID numbers in the server bootstrap filter', () => {
  it('listing agency staff (principal and assigned field agent) see every ID in full', () => {
    for (const actor of [
      { userId: 'u-admin-a', role: 'client_admin', agencyId: 'ag-a' },
      { userId: 'u-james', role: 'ground_agent', agencyId: 'ag-a' },
    ]) {
      const apps = appsFor(actor)
      expect(apps).toHaveLength(1)
      expect(idsOf(apps[0])).toEqual({ main: MAIN_ID, adults: [MAIN_ID, CO_ID, GUARANTOR_ID] })
    }
  })

  it('the applicant sees their own application in full', () => {
    const apps = appsFor({ userId: 'u-t', role: 'tenant', agencyId: null })
    expect(apps).toHaveLength(1)
    expect(idsOf(apps[0])).toEqual({ main: MAIN_ID, adults: [MAIN_ID, CO_ID, GUARANTOR_ID] })
  })

  it('super admin gets maskIdNumber for the applicant, co-applicant and guarantor', () => {
    const apps = appsFor({ userId: 'u-sa', role: 'super_admin', agencyId: null })
    expect(apps).toHaveLength(1)
    expect(fullIdsAnywhere(apps)).toEqual([])
    expect(idsOf(apps[0])).toEqual({
      main: maskIdNumber(MAIN_ID),
      adults: [maskIdNumber(MAIN_ID), maskIdNumber(CO_ID), maskIdNumber(GUARANTOR_ID)],
    })
    // The rest of the row is untouched.
    expect(apps[0].phone).toBe('0821234567')
    expect(apps[0].employerName).toBe('Acme')
  })

  it('the landlord gets no ID at all', () => {
    const apps = appsFor({ userId: 'u-ll', role: 'landlord', agencyId: null })
    expect(fullIdsAnywhere(apps)).toEqual([])
    for (const a of apps) expect(a.idNumberOrPassport ?? '').not.toMatch(/\d{5}/)
  })

  it("another agency's staff get the row masked or not at all", () => {
    expect(fullIdsAnywhere(appsFor({ userId: 'u-admin-b', role: 'client_admin', agencyId: 'ag-b' }))).toEqual([])
    // Even a row that names ag-b on the application but sits on ag-a's listing.
    const crossed = { ...raw, applications: [{ ...app, agencyId: 'ag-b' }] }
    const apps = appsFor({ userId: 'u-admin-b', role: 'client_admin', agencyId: 'ag-b' }, crossed)
    expect(fullIdsAnywhere(apps)).toEqual([])
  })

  it("another tenant never gets the applicant's ID", () => {
    expect(fullIdsAnywhere(appsFor({ userId: 'u-t2', role: 'tenant', agencyId: null }))).toEqual([])
  })

  it('pin (B5): a tenant whose application has no applicantUserId (matched by email) keeps their full ID', () => {
    const byEmail = { ...app, applicantUserId: undefined, email: 'TENANT@example.com' }
    const entities = { ...raw, applications: [byEmail] }
    const out = scopeApplicationIdNumbers(
      entities as never,
      raw as never,
      { userId: 'u-t', role: 'tenant', agencyId: null } as never,
      new Set(['u-t']),
    )
    const rows = out.applications as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(idsOf(rows[0])).toEqual({ main: MAIN_ID, adults: [MAIN_ID, CO_ID, GUARANTOR_ID] })
    // Another tenant holding the same row still gets it masked.
    const other = scopeApplicationIdNumbers(
      entities as never,
      raw as never,
      { userId: 'u-t2', role: 'tenant', agencyId: null } as never,
      new Set(['u-t2']),
    )
    expect(fullIdsAnywhere(other.applications as Array<Record<string, unknown>>)).toEqual([])
  })

  it('pin (M8): scopeApplicationIdNumbers masks a row a tenant holds that is not their own application', () => {
    const foreign = { ...app, id: 'APP-2', applicantUserId: 'u-t', email: 'tenant@example.com' }
    const entities = { ...raw, applications: [foreign] }
    const out = scopeApplicationIdNumbers(
      entities as never,
      raw as never,
      { userId: 'u-t2', role: 'tenant', agencyId: null } as never,
      new Set(['u-t2']),
    )
    const rows = out.applications as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(fullIdsAnywhere(rows)).toEqual([])
    expect(idsOf(rows[0])).toEqual({
      main: maskIdNumber(MAIN_ID),
      adults: [maskIdNumber(MAIN_ID), maskIdNumber(CO_ID), maskIdNumber(GUARANTOR_ID)],
    })
    // The same row stays full for its own applicant.
    const own = scopeApplicationIdNumbers(
      entities as never,
      raw as never,
      { userId: 'u-t', role: 'tenant', agencyId: null } as never,
      new Set(['u-t']),
    )
    expect(idsOf((own.applications as Array<Record<string, unknown>>)[0]).main).toBe(MAIN_ID)
  })
})
