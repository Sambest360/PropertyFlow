import { describe, expect, it } from 'vitest'
import { filterBootstrapForActor } from './scopeGate'
import { buildPropertyScope } from '../src/lib/scope'
import type { DemoActor } from './actor'

/**
 * Portal own-rows rule (Angela #80 FAIL 1) + trust / null-agency leaks (Jim B1).
 * Tenant u-t applied to public listing p-1 (so p-1 is in their property scope)
 * and rents p-2. Other people (u-o applicant + current tenant, u-p previous
 * tenant) have rows on p-1 that must not reach u-t.
 */
const u = (id: string, role: string, agencyId: string | null) => ({
  id,
  name: `${id} name`,
  email: `${id}@x.test`,
  phone: `phone-${id}`,
  role,
  agencyId,
  active: true,
})

const users = [
  u('u-t', 'tenant', null),
  u('u-o', 'tenant', null),
  u('u-p', 'tenant', null),
  u('u-ll', 'landlord', 'ag-a'),
  u('u-ll2', 'landlord', 'ag-a'),
  u('u-con', 'contractor', null),
  u('u-con2', 'contractor', null),
  u('u-james', 'ground_agent', 'ag-a'),
  u('u-admin', 'client_admin', 'ag-a'),
  u('u-admin-b', 'client_admin', 'ag-b'),
]

const properties = [
  { id: 'p-1', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll' },
  { id: 'p-2', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll' },
  { id: 'p-3', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll2' },
]

const app = (id: string, propertyId: string, who: string) => ({
  id,
  agencyId: 'ag-a',
  propertyId,
  agentId: 'u-james',
  applicantUserId: who,
  applicantName: `${who} name`,
  email: `${who}@x.test`,
  phone: `phone-${who}`,
  idNumberOrPassport: `ID-${who}`,
  // Real bootstrap shape (server/bootstrap.ts hydrateDocumentsFromUploadedJson).
  documents: [
    {
      key: 'id',
      label: 'ID document',
      status: 'uploaded',
      note: `call ${who} on phone-${who}`,
      file: {
        name: `${who}-id.pdf`,
        mimeType: 'application/pdf',
        dataUrl: `data:application/pdf;base64,PACK-${who}`,
        uploadedAt: '2026-10-01',
        uploadedBy: who,
      },
    },
    { key: 'payslip', label: 'Payslips', status: 'required' },
  ],
  docs: ['ID document'],
  keyCollection: { location: 'Office', instructions: 'Bring ID', contactName: `${who} name`, contactPhone: `kc-phone-${who}` },
  stage: 'Submitted',
  income: 20000,
})

const tenancy = (id: string, propertyId: string, who: string, extra: Record<string, unknown> = {}) => ({
  id,
  agencyId: 'ag-a',
  propertyId,
  landlordId: 'u-ll',
  agentId: 'u-james',
  applicationId: null,
  tenantUserId: who,
  tenantName: `${who} name`,
  tenantEmail: `${who}@x.test`,
  status: 'Active',
  keyCollection: { location: 'Office', instructions: 'Bring ID', contactName: `${who} name`, contactPhone: `phone-${who}` },
  ...extra,
})

const doc = (id: string, propertyId: string, extra: Record<string, unknown> = {}) => ({
  id,
  agencyId: 'ag-a',
  propertyId,
  name: `${id}.pdf`,
  category: 'Other',
  status: 'uploaded',
  fileUrl: `https://files.test/${id}.pdf`,
  ...extra,
})

const raw = {
  source: 'test',
  fetchedAt: '2026-10-09',
  agencies: [{ id: 'ag-a' }, { id: 'ag-b' }],
  users,
  buildings: [],
  units: [],
  properties,
  leads: [
    { id: 'L-t', agencyId: 'ag-a', propertyId: 'p-1', agentId: 'u-james', name: 'u-t name', email: 'U-T@x.test', phone: 'phone-u-t' },
    { id: 'L-o', agencyId: 'ag-a', propertyId: 'p-1', agentId: 'u-james', name: 'u-o name', email: 'u-o@x.test', phone: 'phone-u-o' },
    { id: 'L-3', agencyId: 'ag-a', propertyId: 'p-3', agentId: 'u-james', name: 'x name', email: 'x@x.test', phone: 'phone-x' },
  ],
  applications: [app('A-t', 'p-1', 'u-t'), app('A-o', 'p-1', 'u-o'), app('A-3', 'p-3', 'u-p')],
  tenancies: [
    tenancy('TN-o', 'p-1', 'u-o'),
    tenancy('TN-p', 'p-1', 'u-p', { status: 'Ended' }),
    tenancy('TN-t', 'p-2', 'u-t', { leaseDocumentId: 'D-lease-t' }),
    tenancy('TN-3', 'p-3', 'u-p', { landlordId: 'u-ll2' }),
  ],
  viewings: [
    { id: 'V-t', agencyId: 'ag-a', propertyId: 'p-1', agentId: 'u-james', applicantName: 'u-t name', applicantEmail: 'u-t@x.test' },
    { id: 'V-o', agencyId: 'ag-a', propertyId: 'p-1', agentId: 'u-james', applicantName: 'u-o name', applicantEmail: 'u-o@x.test' },
    { id: 'V-t-noemail', agencyId: 'ag-a', propertyId: 'p-1', agentId: 'u-james', applicantName: 'U-T Name' },
    { id: 'V-other-noemail', agencyId: 'ag-a', propertyId: 'p-1', agentId: 'u-james', applicantName: 'Someone Else' },
    // Same name as u-t but someone else's email: not theirs.
    { id: 'V-namesake', agencyId: 'ag-a', propertyId: 'p-1', agentId: 'u-james', applicantName: 'u-t name', applicantEmail: 'namesake@x.test' },
  ],
  viewingSlots: [],
  propertyDocuments: [
    doc('D-pack-o', 'p-1', { applicationId: 'A-o', applicantName: 'u-o name', category: 'Other' }),
    doc('D-pack-t', 'p-1', { applicationId: 'A-t', applicantName: 'u-t name' }),
    doc('D-lease-o', 'p-1', { tenancyId: 'TN-o', category: 'Lease' }),
    doc('D-comp-p1', 'p-1', { category: 'Compliance' }),
    doc('D-title-p1', 'p-1', { category: 'Title' }),
    doc('D-lease-t', 'p-2', { category: 'Lease' }),
    doc('D-tn-t', 'p-2', { tenancyId: 'TN-t', category: 'Inspection' }),
    doc('D-comp-p2', 'p-2', { category: 'Compliance' }),
    doc('D-up-t', 'p-1', { uploadedByUserId: 'u-t' }),
    doc('D-up-con', 'p-1', { uploadedByUserId: 'u-con', category: 'Inspection' }),
    // Applicant pack linked to a lease: still pack (classified by type, not tenancyId).
    doc('D-pack-lease-o', 'p-1', { tenancyId: 'TN-o', applicantName: 'u-o name', category: 'Other' }),
    // Raw ID-type document with no applicant link: pack by source type.
    doc('D-id-raw', 'p-1', { sourceType: 'ID', category: 'Other' }),
    // Signed lease carrying the applicant's name: both lease parties keep it.
    doc('D-signed-lease-o', 'p-1', { tenancyId: 'TN-o', applicantName: 'u-o name', category: 'Lease', sourceType: 'LEASE' }),
  ],
  tickets: [
    { id: 'TK-1', agencyId: 'ag-a', propertyId: 'p-1', assignedAgentId: null, contractorId: 'u-con', reportedByUserId: 'u-o', status: 'Assigned' },
    { id: 'TK-t', agencyId: 'ag-a', propertyId: 'p-2', assignedAgentId: 'u-james', contractorId: 'u-con2', reportedByUserId: 'u-t', status: 'Assigned' },
  ],
  payments: [
    { id: 'PAY-o', agencyId: 'ag-a', propertyId: 'p-1', partyUserId: 'u-o', partyName: 'u-o name', landlordVisible: true },
    { id: 'PAY-t', agencyId: 'ag-a', propertyId: 'p-2', partyUserId: 'u-t', partyName: 'u-t name', landlordVisible: true },
  ],
  threads: [
    { id: 'TH-con', agencyId: 'ag-a', propertyId: 'p-1', participantIds: ['u-con', 'u-james'] },
    { id: 'TH-p1', agencyId: 'ag-a', propertyId: 'p-1', participantIds: ['u-o', 'u-james'] },
  ],
  messages: [
    { id: 'M-con', threadId: 'TH-con', agencyId: 'ag-a' },
    { id: 'M-p1', threadId: 'TH-p1', agencyId: 'ag-a' },
  ],
  notifications: [],
  suiteAlerts: [{ id: 'SA-null', agencyId: null }, { id: 'SA-a', agencyId: 'ag-a' }],
  activities: [{ id: 'AC-null', agencyId: null }, { id: 'AC-a', agencyId: 'ag-a' }, { id: 'AC-b', agencyId: 'ag-b' }],
  trustTransactions: [{ id: 'TT-a', agencyId: 'ag-a' }, { id: 'TT-b', agencyId: 'ag-b' }, { id: 'TT-null', agencyId: null }],
  trustAllocations: [{ id: 'TA-a', agencyId: 'ag-a' }, { id: 'TA-b', agencyId: 'ag-b' }],
  payoutInstructions: [{ id: 'PI-a', agencyId: 'ag-a' }, { id: 'PI-b', agencyId: 'ag-b' }],
  depositHoldings: [{ id: 'DH-a', agencyId: 'ag-a' }, { id: 'DH-b', agencyId: 'ag-b' }],
  arrearsSnapshots: [{ id: 'AS-a', agencyId: 'ag-a' }, { id: 'AS-b', agencyId: 'ag-b' }],
  csvImportBatches: [{ id: 'CB-a', agencyId: 'ag-a' }, { id: 'CB-b', agencyId: 'ag-b' }],
  agencyContractors: [],
}

const TRUST_KEYS = [
  'trustTransactions',
  'trustAllocations',
  'payoutInstructions',
  'depositHoldings',
  'arrearsSnapshots',
  'csvImportBatches',
] as const

function run(actor: DemoActor, input: typeof raw = raw) {
  const scope = buildPropertyScope(
    { role: actor.role as never, userId: actor.userId, agencyId: actor.agencyId },
    {
      properties: input.properties,
      applications: input.applications,
      tenancies: input.tenancies,
      tickets: input.tickets,
      viewerEmail: users.find((x) => x.id === actor.userId)?.email,
    } as never,
  )
  return filterBootstrapForActor(input as never, actor, scope) as unknown as Record<string, Array<Record<string, unknown>>>
}

const ids = (rows: Array<Record<string, unknown>>) => rows.map((r) => r.id).sort()
const collectionsJson = (out: Record<string, unknown>) =>
  JSON.stringify([out.leads, out.applications, out.viewings, out.tenancies, out.propertyDocuments])

describe('portal own-rows rule: tenant who applied to a public listing', () => {
  const tenant: DemoActor = { userId: 'u-t', role: 'tenant', agencyId: null }
  const out = run(tenant)

  it('the applied-to listing is in scope (so the narrowing below matters)', () => {
    expect(ids(out.properties)).toEqual(['p-1', 'p-2'])
  })

  it('leads: only the lead under their own email', () => {
    expect(ids(out.leads)).toEqual(['L-t'])
  })

  it('applications: only their own', () => {
    expect(ids(out.applications)).toEqual(['A-t'])
  })

  it('viewings: only theirs by email, or by name when the viewing has no email', () => {
    expect(ids(out.viewings)).toEqual(['V-t', 'V-t-noemail'])
  })

  it('tenancies: only their own, not the current or previous tenants on the applied-to property', () => {
    expect(ids(out.tenancies)).toEqual(['TN-t'])
  })

  it('propertyDocuments: own uploads, own application/tenancy docs, lease PDF, compliance on their rented unit', () => {
    expect(ids(out.propertyDocuments)).toEqual(['D-comp-p2', 'D-lease-t', 'D-pack-t', 'D-tn-t', 'D-up-t'])
  })

  it("no other person's email, phone, ID number or file link in those collections", () => {
    const json = collectionsJson(out)
    for (const needle of ['u-o@', 'u-p@', 'namesake@', 'phone-u-o', 'phone-u-p', 'ID-u-o', 'u-o-id.pdf', 'PACK-u-o', 'D-pack-o', 'D-lease-o', 'D-pack-lease-o', 'D-id-raw', 'D-signed-lease-o', 'x@x.test']) {
      expect(json).not.toContain(needle)
    }
  })

  it('a tenancy with no tenantUserId created from their own application counts as theirs', () => {
    const input = {
      ...raw,
      tenancies: [...raw.tenancies, tenancy('TN-orphan', 'p-1', '', { tenantUserId: null, applicationId: 'A-t' }), tenancy('TN-orphan-o', 'p-1', '', { tenantUserId: null, applicationId: 'A-o' })],
    }
    expect(ids(run(tenant, input).tenancies)).toEqual(['TN-orphan', 'TN-t'])
  })
})

describe('portal own-rows rule: landlord', () => {
  const landlord: DemoActor = { userId: 'u-ll', role: 'landlord', agencyId: 'ag-a' }
  const out = run(landlord)

  it('keeps rows on their own properties only', () => {
    expect(ids(out.properties)).toEqual(['p-1', 'p-2'])
    expect(ids(out.leads)).toEqual(['L-o', 'L-t'])
    expect(ids(out.applications)).toEqual(['A-o', 'A-t'])
    expect(ids(out.viewings)).toEqual(['V-namesake', 'V-o', 'V-other-noemail', 'V-t', 'V-t-noemail'])
    expect(ids(out.tenancies)).toEqual(['TN-o', 'TN-p', 'TN-t'])
  })

  it('names stay for landlord review / owner statement, contact fields are removed', () => {
    const a = out.applications.find((x) => x.id === 'A-o')!
    expect(a.applicantName).toBe('u-o name')
    expect(a.income).toBe(20000)
    expect(a.email).toBe('')
    expect(a.phone).toBe('')
    expect(a).not.toHaveProperty('idNumberOrPassport')
    const t = out.tenancies.find((x) => x.id === 'TN-o')!
    expect(t.tenantName).toBe('u-o name')
    expect(t.tenantUserId).toBe('u-o')
    expect(t.tenantEmail).toBe('')
    expect((t.keyCollection as Record<string, unknown>).contactPhone).toBe('')
    for (const l of out.leads) expect([l.email, l.phone]).toEqual(['', ''])
    for (const v of out.viewings) expect(v).not.toHaveProperty('applicantEmail')
  })

  it('documents on their properties minus applicant-pack files', () => {
    expect(ids(out.propertyDocuments)).toEqual([
      'D-comp-p1',
      'D-comp-p2',
      'D-lease-o',
      'D-lease-t',
      'D-signed-lease-o',
      'D-title-p1',
      'D-tn-t',
      'D-up-con',
      'D-up-t',
    ])
  })

  it('application documents keep only the checklist: no file payload, dataUrl or note', () => {
    for (const a of out.applications) {
      expect(a.documents).toEqual([
        { key: 'id', label: 'ID document', status: 'uploaded' },
        { key: 'payslip', label: 'Payslips', status: 'required' },
      ])
    }
    const json = JSON.stringify(out.applications)
    expect(json).not.toContain('dataUrl')
    expect(json).not.toContain('PACK-')
    expect(json).not.toContain('-id.pdf')
  })

  it('application keyCollection.contactPhone is blanked', () => {
    for (const a of out.applications) {
      expect((a.keyCollection as Record<string, unknown>).contactPhone).toBe('')
    }
    expect(JSON.stringify(out.applications)).not.toContain('kc-phone-')
  })

  it('a pack document linked to a lease, and a raw ID-type document, are not sent', () => {
    const got = ids(out.propertyDocuments)
    expect(got).not.toContain('D-pack-lease-o')
    expect(got).not.toContain('D-id-raw')
  })

  it("no other person's email, phone, ID number or applicant file link in those collections", () => {
    const json = collectionsJson(out)
    for (const needle of ['@x.test', 'phone-', 'ID-u-', '-id.pdf', 'PACK-', 'D-pack-', 'D-id-raw']) {
      expect(json).not.toContain(needle)
    }
  })
})

describe('portal own-rows rule: contractor', () => {
  const contractor: DemoActor = { userId: 'u-con', role: 'contractor', agencyId: null }
  const out = run(contractor)

  it('the job property is in scope', () => {
    expect(ids(out.properties)).toEqual(['p-1'])
  })

  it('gets no leads, applications, viewings or tenancies', () => {
    expect(out.leads).toEqual([])
    expect(out.applications).toEqual([])
    expect(out.viewings).toEqual([])
    expect(out.tenancies).toEqual([])
  })

  it('propertyDocuments: only documents they uploaded', () => {
    expect(ids(out.propertyDocuments)).toEqual(['D-up-con'])
  })

  it('gets no payments, even on the job property', () => {
    expect(out.payments).toEqual([])
  })

  it('threads only where they are a participant, and messages in those threads only', () => {
    expect(ids(out.threads)).toEqual(['TH-con'])
    expect(ids(out.messages)).toEqual(['M-con'])
  })
})

describe('tenant tickets: own only', () => {
  // An agency tenant (ticketInScope passes the agency check for them).
  const out = run({ userId: 'u-t', role: 'tenant', agencyId: 'ag-a' })

  it('a tenant gets only tickets they reported, not others on the applied-to listing', () => {
    expect(ids(out.tickets)).toEqual(['TK-t'])
  })

  it("the users list adds only those tickets' reporters (not the assigned contractor)", () => {
    const userIds = out.users.map((x) => x.id)
    expect(userIds).toContain('u-t')
    expect(userIds).not.toContain('u-con2')
    expect(userIds).not.toContain('u-con')
    expect(userIds).not.toContain('u-o')
  })
})

describe('tenant compliance documents need an Active tenancy', () => {
  const withStatus = (status: string) =>
    run(
      { userId: 'u-t', role: 'tenant', agencyId: null },
      {
        ...raw,
        tenancies: raw.tenancies.map((t) => (t.id === 'TN-t' ? { ...t, status } : t)),
      },
    )

  it('Active tenancy: unit compliance documents are included', () => {
    expect(ids(withStatus('Active').propertyDocuments)).toContain('D-comp-p2')
  })

  it('Pending Move-In tenancy: no unit compliance documents', () => {
    expect(ids(withStatus('Pending Move-In').propertyDocuments)).not.toContain('D-comp-p2')
  })

  it('Ended tenancy: no unit compliance documents', () => {
    expect(ids(withStatus('Ended').propertyDocuments)).not.toContain('D-comp-p2')
  })
})

describe('staff keep their existing scope', () => {
  it('a ground agent still gets every lead on their book with contact fields', () => {
    const out = run({ userId: 'u-james', role: 'ground_agent', agencyId: 'ag-a' })
    expect(ids(out.leads)).toEqual(['L-3', 'L-o', 'L-t'])
    expect(out.leads.find((l) => l.id === 'L-o')!.email).toBe('u-o@x.test')
  })
})

describe('trust books and null-agency pass-through (B1)', () => {
  it('a no-agency tenant session gets 0 trust rows', () => {
    const out = run({ userId: 'u-t', role: 'tenant', agencyId: null })
    for (const k of TRUST_KEYS) expect(out[k]).toEqual([])
  })

  it('tenant, landlord, contractor, agent and ground_agent get 0 trust rows even with an agency', () => {
    const actors: DemoActor[] = [
      { userId: 'u-t', role: 'tenant', agencyId: 'ag-a' },
      { userId: 'u-ll', role: 'landlord', agencyId: 'ag-a' },
      { userId: 'u-con', role: 'contractor', agencyId: 'ag-a' },
      { userId: 'u-james', role: 'ground_agent', agencyId: 'ag-a' },
      { userId: 'u-james', role: 'agent', agencyId: 'ag-a' },
    ]
    for (const a of actors) {
      const out = run(a)
      for (const k of TRUST_KEYS) expect(out[k], `${a.role} ${k}`).toEqual([])
    }
  })

  it('an agency admin gets only their own agency trust rows', () => {
    const out = run({ userId: 'u-admin', role: 'client_admin', agencyId: 'ag-a' })
    expect(ids(out.trustTransactions)).toEqual(['TT-a'])
    expect(ids(out.payoutInstructions)).toEqual(['PI-a'])
    expect(ids(out.csvImportBatches)).toEqual(['CB-a'])
  })

  it('an agency-wide admin with no agency gets no agency rows and no trust rows', () => {
    const out = run({ userId: 'u-admin', role: 'client_admin', agencyId: null })
    expect(out.properties).toEqual([])
    expect(out.leads).toEqual([])
    expect(out.tenancies).toEqual([])
    expect(out.activities).toEqual([])
    for (const k of TRUST_KEYS) expect(out[k]).toEqual([])
  })

  it('property-locked actors get no null-agency activities or suite alerts', () => {
    const noAgency = run({ userId: 'u-t', role: 'tenant', agencyId: null })
    expect(noAgency.activities).toEqual([])
    expect(noAgency.suiteAlerts).toEqual([])
    const ll = run({ userId: 'u-ll', role: 'landlord', agencyId: 'ag-a' })
    expect(ids(ll.activities)).toEqual(['AC-a'])
    expect(ids(ll.suiteAlerts)).toEqual(['SA-a'])
  })
})
