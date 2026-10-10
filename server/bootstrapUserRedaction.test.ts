import { describe, expect, it } from 'vitest'
import { filterBootstrapForActor, filterBootstrapUsersForActor, redactBootstrapUser, scopeLeaseSignReads } from './scopeGate'
import { filterBootstrapForGuest } from './guestMarketplace'
import { buildPropertyScope } from '../src/lib/scope'
import type { DemoActor } from './actor'

const doc = { key: 'id', label: 'ID', name: 'id.pdf', mimeType: 'application/pdf', dataUrl: 'data:x', uploadedAt: '2026-01-01' }
const u = (id: string, role: string, agencyId: string | null) => ({
  id,
  name: `${id} name`,
  email: `${id}@x.test`,
  phone: `phone-${id}`,
  role,
  agencyId,
  active: true,
  idNumberOrPassport: `ID-${id}`,
  verification: { status: 'approved', reviewedAt: '2026-01-02', profile: { idNumberOrPassport: `ID-${id}` }, documents: [doc] },
})

const users = [
  u('u-tenant', 'tenant', null),
  u('u-other-tenant', 'tenant', null),
  u('u-james', 'ground_agent', 'ag-a'),
  u('u-ll', 'landlord', 'ag-a'),
  u('u-ll-b', 'landlord', 'ag-b'),
  u('u-con', 'contractor', 'ag-b'),
]

const raw = {
  source: 'test',
  fetchedAt: '2026-01-01',
  agencies: [{ id: 'ag-a' }, { id: 'ag-b' }],
  users,
  buildings: [],
  units: [],
  properties: [{ id: 'p-1', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll' }],
  leads: [],
  applications: [{ propertyId: 'p-1', agencyId: 'ag-a', agentId: 'u-james', applicantUserId: 'u-tenant', email: 'u-tenant@x.test' }],
  tenancies: [],
  viewings: [],
  payments: [],
  propertyDocuments: [],
  tickets: [],
  threads: [{ id: 'th-1', agencyId: 'ag-a', propertyId: 'p-1', participantIds: ['u-tenant', 'u-ll'] }],
  messages: [],
  notifications: [],
  agencyContractors: [
    { agencyId: 'ag-b', contractorUserId: 'u-con' },
    { agencyId: 'ag-a', contractorUserId: 'u-con-a' },
  ],
}

describe('bootstrap user redaction', () => {
  it('redactBootstrapUser drops email, phone, ID number, verification profile and documents', () => {
    const r = redactBootstrapUser(users[2])
    expect(r).toEqual({
      id: 'u-james',
      name: 'u-james name',
      role: 'ground_agent',
      agencyId: 'ag-a',
      active: true,
      verification: { status: 'approved', reviewedAt: '2026-01-02' },
    })
  })

  it('a null-agency tenant keeps names of the agent and landlord on their own rows only', () => {
    const actor: DemoActor = { userId: 'u-tenant', role: 'tenant', agencyId: null }
    const scope = buildPropertyScope(
      { role: 'tenant', userId: 'u-tenant', agencyId: null },
      {
        properties: [{ id: 'p-1', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll' }],
        applications: [{ propertyId: 'p-1', applicantUserId: 'u-tenant', email: 'u-tenant@x.test', stage: 'Submitted' }],
        tenancies: [],
        tickets: [],
      } as never,
    )
    const out = filterBootstrapForActor(raw as never, actor, scope)
    const outUsers = out.users as Array<Record<string, unknown>>
    expect(outUsers.map((x) => x.id).sort()).toEqual(['u-james', 'u-ll', 'u-tenant'])
    for (const x of outUsers.filter((y) => y.id !== 'u-tenant')) {
      expect(x.email).toBeUndefined()
      expect(x.phone).toBeUndefined()
      expect(x.name).toBe(`${String(x.id)} name`)
    }
    // Roster rows from other agencies are not shipped to a tenant.
    expect(out.agencyContractors).toEqual([])
  })

  it('agency admin also sees contractor names (any agency) for the roster picker, redacted', () => {
    const actor: DemoActor = { userId: 'u-adm', role: 'client_admin', agencyId: 'ag-a' }
    const out = filterBootstrapUsersForActor([...users, u('u-adm', 'client_admin', 'ag-a')], actor, raw as never)
    const con = out.find((x) => x.id === 'u-con')!
    expect(con).toBeDefined()
    expect(con.email).toBeUndefined()
    expect(out.find((x) => x.id === 'u-ll-b')).toBeUndefined()
    expect(out.find((x) => x.id === 'u-ll')?.email).toBe('u-ll@x.test')
  })
})

describe('guest marketplace slice', () => {
  it('keeps published listings, sends no users, drops everything private', () => {
    const out = filterBootstrapForGuest({
      source: 'postgres',
      fetchedAt: 'now',
      agencies: [{ id: 'ag-a', name: 'A', slug: 'a', city: 'PE', status: 'Active' }, { id: 'ag-b', name: 'B' }],
      users,
      buildings: [{ id: 'b-1', landlordId: 'u-ll' }, { id: 'b-2' }],
      units: [
        { id: 'unt-p-pub', buildingId: 'b-1', listingType: 'rent', statusKey: 'PUBLISHED' },
        { id: 'unt-p-draft', buildingId: 'b-2', listingType: 'rent', statusKey: 'DRAFT' },
      ],
      properties: [
        { id: 'p-pub', unitId: 'unt-p-pub', status: 'Published', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll', internalAssets: [{ serialNumber: 'SN1' }] },
        { id: 'p-draft', unitId: 'unt-p-draft', status: 'Draft', agencyId: 'ag-b', agentId: null, landlordId: 'u-ll-b' },
      ],
      leads: [{ id: 'L1', email: 'lead@x.test' }],
      applications: [{ id: 'A1' }],
      payments: [{ id: 'P1' }],
      threads: [{ id: 'T1' }],
      trustTransactions: [{ id: 'TT1' }],
      viewingSlots: [{ id: 'VS1', propertyId: 'p-pub', notes: 'gate code 1234' }, { id: 'VS2', propertyId: 'p-draft' }],
    })
    expect((out.properties as Array<{ id: string }>).map((p) => p.id)).toEqual(['p-pub'])
    expect((out.units as Array<{ id: string }>).map((x) => x.id)).toEqual(['unt-p-pub'])
    expect((out.agencies as Array<{ id: string }>).map((x) => x.id)).toEqual(['ag-a'])
    expect(out.users).toEqual([])
    const json = JSON.stringify(out)
    expect(json).not.toContain('@x.test')
    expect(json).not.toContain('phone-')
    expect(json).not.toContain('ID-')
    expect(json).not.toContain('data:x')
    expect(json).not.toContain('SN1')
    expect(json).not.toContain('gate code')
    for (const k of ['leads', 'applications', 'payments', 'threads', 'trustTransactions']) {
      expect(out[k]).toEqual([])
    }
  })

  it('drops landlord identity, verification status and agent ids; keeps the agent display name', () => {
    const out = filterBootstrapForGuest({
      agencies: [{ id: 'ag-a', name: 'A' }],
      users,
      buildings: [{ id: 'b-1', landlordId: 'u-ll' }],
      units: [{ id: 'unt-p-pub', buildingId: 'b-1', agentId: 'u-james', listingType: 'rent', statusKey: 'PUBLISHED' }],
      properties: [
        { id: 'p-pub', unitId: 'unt-p-pub', status: 'Published', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll' },
        { id: 'p-noagent', status: 'Published', agencyId: 'ag-a', agentId: null, landlordId: 'u-ll' },
      ],
      viewingSlots: [{ id: 'VS1', propertyId: 'p-pub', agentId: 'u-james' }],
    })
    const props = out.properties as Array<Record<string, unknown>>
    expect(props.map((p) => [p.id, p.agentId, p.landlordId, p.agentName])).toEqual([
      ['p-pub', null, '', 'u-james name'],
      ['p-noagent', null, '', null],
    ])
    expect((out.units as Array<Record<string, unknown>>)[0].agentId).toBeNull()
    expect((out.buildings as Array<Record<string, unknown>>)[0].landlordId).toBeNull()
    expect((out.viewingSlots as Array<Record<string, unknown>>)[0].agentId).toBe('')
    const json = JSON.stringify(out)
    expect(json).not.toContain('u-ll')
    expect(json).not.toContain('"u-james"')
    expect(json).not.toContain('approved')
    expect(json).not.toContain('verification')
  })
})

describe('CR10 A: bootstrap returns signature for the session user only', () => {
  const SIG = 'data:image/png;base64,AAAA'
  const withSig = users.map((x) => ({ ...x, signature: SIG }))
  const sigRaw = { ...raw, users: [...withSig, { ...u('u-adm', 'client_admin', 'ag-a'), signature: SIG }, { ...u('u-sa', 'super_admin', null), signature: SIG }] }
  const scopeFor = (role: string, userId: string, agencyId: string | null) =>
    buildPropertyScope({ role, userId, agencyId } as never, {
      properties: raw.properties,
      applications: raw.applications,
      tenancies: [],
      tickets: [],
    } as never)
  const check = (actor: DemoActor) => {
    const out = filterBootstrapForActor(sigRaw as never, actor, scopeFor(actor.role, actor.userId, actor.agencyId))
    const list = out.users as Array<Record<string, unknown>>
    expect(list.length).toBeGreaterThan(1)
    for (const x of list) {
      if (x.id === actor.userId) expect(x.signature).toBe(SIG)
      else expect(x).not.toHaveProperty('signature')
    }
  }
  it('tenant', () => check({ userId: 'u-tenant', role: 'tenant', agencyId: null }))
  it('same-agency users.manage admin', () => check({ userId: 'u-adm', role: 'client_admin', agencyId: 'ag-a' }))
  it('super admin', () => check({ userId: 'u-sa', role: 'super_admin', agencyId: null }))
  it('redactBootstrapUser drops it', () => {
    expect(redactBootstrapUser(withSig[0])).not.toHaveProperty('signature')
  })
})

describe('CR10 B: lease_signed reads are scoped to the lease parties, its agency staff and super admin', () => {
  const ev = (tenancyId: string) => ({ id: `e-${tenancyId}`, tenancyId, party: 'tenant', ip: '1.1.1.1', userAgent: 'ua' })
  const raw2 = { ...raw, leaseSignEvents: [ev('L-mine'), ev('L-other')] }
  const withTenancies = (ids: string[]) =>
    ({ ...raw, tenancies: ids.map((id) => ({ id, eSign: { tenant: { status: 'signed', ip: '1.1.1.1', userAgent: 'ua' }, landlord: null } })) }) as never

  it('a tenant gets only rows for leases they receive, without IP / user agent (rows and stamps)', () => {
    const out = scopeLeaseSignReads(withTenancies(['L-mine']), raw2 as never, { userId: 'u-tenant', role: 'tenant', agencyId: null })
    const rows = out.leaseSignEvents as Array<Record<string, unknown>>
    expect(rows.map((r) => r.tenancyId)).toEqual(['L-mine'])
    expect(rows[0]).not.toHaveProperty('ip')
    expect(rows[0]).not.toHaveProperty('userAgent')
    const t = (out.tenancies as Array<{ eSign: { tenant: Record<string, unknown> } }>)[0]
    expect(t.eSign.tenant).not.toHaveProperty('ip')
  })
  it('an unrelated tenant or another agency (no visible tenancies) gets none', () => {
    const out = scopeLeaseSignReads(withTenancies([]), raw2 as never, { userId: 'u-x', role: 'agent', agencyId: 'ag-b' })
    expect(out.leaseSignEvents).toEqual([])
  })
  it('agency staff keep IP / user agent; super admin sees all rows', () => {
    const staff = scopeLeaseSignReads(withTenancies(['L-mine']), raw2 as never, { userId: 'u-james', role: 'agent', agencyId: 'ag-a' })
    expect((staff.leaseSignEvents as Array<Record<string, unknown>>)[0].ip).toBe('1.1.1.1')
    const sa = scopeLeaseSignReads(withTenancies([]), raw2 as never, { userId: 'u-sa', role: 'super_admin', agencyId: null })
    expect((sa.leaseSignEvents as unknown[]).length).toBe(2)
  })
  it('CR10 fix 5: a user from another agency gets no lease_signed rows, even for a tenancy id they can see', () => {
    const rows = { ...raw, leaseSignEvents: [{ ...ev('L-mine'), agencyId: 'ag-a' }] }
    const other = scopeLeaseSignReads(withTenancies(['L-mine']), rows as never, { userId: 'u-x', role: 'agent', agencyId: 'ag-b' })
    expect(other.leaseSignEvents).toEqual([])
    const own = scopeLeaseSignReads(withTenancies(['L-mine']), rows as never, { userId: 'u-james', role: 'agent', agencyId: 'ag-a' })
    expect((own.leaseSignEvents as unknown[]).length).toBe(1)
    const otherAdmin = scopeLeaseSignReads(withTenancies([]), rows as never, { userId: 'u-adm', role: 'client_admin', agencyId: 'ag-b' })
    expect(otherAdmin.leaseSignEvents).toEqual([])
  })
})
