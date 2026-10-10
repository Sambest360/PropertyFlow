import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Jim #80 B5: portal roles (tenant / landlord / contractor) write only what
 * the explicit allow-list in server/portalWritePolicy.ts names. Drives the
 * real assertPersistAllowed over a small in-memory model of the tables.
 */
const query = vi.fn()
const resolveUuid = vi.fn()

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => undefined),
  resolveUuid: (...args: unknown[]) => resolveUuid(...args),
  ensureUuid: vi.fn(async (_t: string, fe: string) => UUID[fe] ?? '00000000-0000-4000-8000-00000000ffff'),
  forgetId: vi.fn(),
  isUuid: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

vi.mock('./supabase/registerUser.js', () => ({ linkStaffAuthUser: vi.fn() }))

const loadIdMapCache = vi.fn()
vi.mock('./idMapCache.js', async () => {
  const actual = await vi.importActual<typeof import('./idMapCache.js')>('./idMapCache.js')
  return { ...actual, loadIdMapCache: (...args: unknown[]) => loadIdMapCache(...args) }
})

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CA = id(1)
const UN1 = id(10)
const UN2 = id(11)
const UUID: Record<string, string> = {
  'u-t': id(20),
  'u-t2': id(21),
  'u-ll': id(22),
  'u-ll2': id(23),
  'u-co': id(24),
  'u-co2': id(25),
  'u-agent': id(26),
  'L-1': id(30),
  'PAY-1': id(40),
  'PAY-2': id(41),
  'TK-mine': id(50),
  'TK-other': id(51),
  'TK-job': id(52),
  'TK-linked': id(53),
  'TK-staff': id(54),
  'TK-pool': id(55),
  'L-pend': id(31),
  'L-ended': id(32),
  'L-cancel': id(33),
  'L-notice': id(36),
  'L-unit2': id(34),
  'L-otherag': id(35),
  'VW-mine': id(60),
  'VW-other': id(61),
  'VS-1': id(70),
  'TH-1': id(80),
  'TH-2': id(81),
  'LD-1': id(90),
  'ag-a': CA,
  'p-1': UN1,
  'p-2': UN2,
}
const FE_BY_UUID = new Map(Object.entries(UUID).map(([fe, u]) => [u, fe]))
const EMAIL: Record<string, string> = {
  [UUID['u-t']]: 'tess@x.test',
  [UUID['u-t2']]: 'tom@x.test',
}

type Lease = { tenant: string; landlord: string; metadata: Record<string, unknown> }
let leases: Record<string, Lease>
let writes: Array<{ sql: string; params: unknown[] }>

function resetModel() {
  leases = {
    [UUID['L-1']]: {
      tenant: UUID['u-t'],
      landlord: UUID['u-ll'],
      metadata: {
        eSign: {
          status: 'sent',
          envelopeId: 'ENV-1',
          provider: 'stub',
          tenant: { status: 'pending' },
          landlord: { status: 'pending' },
        },
      },
    },
  }
  writes = []
}

function answer(sqlRaw: string, params: unknown[] = []): unknown[] {
  const sql = sqlRaw.replace(/\s+/g, ' ').trim()
  if (sql.startsWith('SELECT contractor_id::text AS contractor_id FROM maintenance_tickets WHERE id')) {
    if (params[0] === UUID['TK-job']) return [{ contractor_id: UUID['u-co'] }]
    if (params[0] === UUID['TK-pool']) return [{ contractor_id: null }]
    return []
  }
  if (/^(UPDATE|INSERT|DELETE)\b/.test(sql)) {
    writes.push({ sql, params })
    return []
  }
  if (sql.includes('FROM units u JOIN buildings b ON b.id = u.building_id') && !sql.includes('WHERE')) {
    return [
      { unit_id: UN1, client_id: CA, agent_id: UUID['u-agent'], landlord_id: UUID['u-ll'] },
      { unit_id: UN2, client_id: CA, agent_id: UUID['u-agent'], landlord_id: UUID['u-ll2'] },
    ]
  }
  if (sql.includes('FROM units u JOIN buildings b ON b.id = u.building_id') && sql.includes('WHERE u.id')) {
    const unit = params[0]
    return [{ client_id: CA, agent_id: UUID['u-agent'], landlord_id: unit === UN2 ? UUID['u-ll2'] : UUID['u-ll'] }]
  }
  if (sql.includes('FROM applications a LEFT JOIN users u')) return []
  if (sql === 'SELECT tenant_id, unit_id FROM leases') {
    return [{ tenant_id: UUID['u-t'], unit_id: UN1 }, { tenant_id: UUID['u-t2'], unit_id: UN1 }]
  }
  if (sql.includes('SELECT contractor_id, unit_id, client_id, status, assigned_to FROM maintenance_tickets')) {
    return [{ contractor_id: UUID['u-co'], unit_id: UN1, client_id: CA, status: 'OPEN', assigned_to: null }]
  }
  if (sql.includes('FROM clients WHERE id')) return [{ status: 'active' }]
  if (/SELECT email FROM users WHERE id = \$1::uuid/.test(sql)) {
    const e = EMAIL[String(params[0])]
    return e ? [{ email: e }] : [{ email: null }]
  }
  if (/SELECT client_id FROM users WHERE id/.test(sql)) return [{ client_id: CA }]
  if (sql.startsWith('SELECT tenant_id::text AS tenant_id, landlord_id::text AS landlord_id, metadata FROM leases')) {
    const l = leases[String(params[0])]
    return l ? [{ tenant_id: l.tenant, landlord_id: l.landlord, metadata: l.metadata }] : []
  }
  if (sql.startsWith('SELECT party_user_id::text AS party_user_id FROM payments')) {
    if (params[0] === UUID['PAY-1']) return [{ party_user_id: UUID['u-t'] }]
    if (params[0] === UUID['PAY-2']) return [{ party_user_id: UUID['u-t2'] }]
    return []
  }
  if (sql.startsWith('SELECT reported_by::text AS reported_by FROM maintenance_tickets')) {
    if (params[0] === UUID['TK-mine']) return [{ reported_by: UUID['u-t'] }]
    if (params[0] === UUID['TK-other']) return [{ reported_by: UUID['u-t2'] }]
    if (params[0] === UUID['TK-job']) return [{ reported_by: UUID['u-agent'] }]
    return []
  }
  if (sql.startsWith('SELECT unit_id, client_id, assigned_to, contractor_id FROM maintenance_tickets')) {
    return [{ unit_id: UN1, client_id: CA, assigned_to: null, contractor_id: UUID['u-co'] }]
  }
  if (sql.startsWith('SELECT visitor_email FROM bookings')) {
    if (params[0] === UUID['VW-mine']) return [{ visitor_email: 'Tess@x.test' }]
    if (params[0] === UUID['VW-other']) return [{ visitor_email: 'tom@x.test' }]
    return []
  }
  if (sql.includes('FROM bookings WHERE slot_id')) {
    return [{ n: 3, mine: params[1] === 'tess@x.test' ? 1 : 0 }]
  }
  if (sql.startsWith('SELECT participant_ids FROM message_threads')) {
    if (params[0] === UUID['TH-1']) return [{ participant_ids: [UUID['u-t'], UUID['u-agent']] }]
    if (params[0] === UUID['TH-2']) return [{ participant_ids: [UUID['u-t2'], UUID['u-agent']] }]
    return []
  }
  if (sql.includes('FROM messages WHERE id')) return []
  if (sql.includes('FROM "bookings" WHERE id') || sql.includes('FROM "viewing_slots" WHERE id')) {
    return [{ id: String(params[0]), unit_id: UN1, client_id: CA, agent_id: UUID['u-agent'] }]
  }
  if (sql.includes('FROM "leases" WHERE id') || sql.includes('FROM "leads" WHERE id')) {
    return [{ id: String(params[0]), unit_id: UN1, client_id: CA, agent_id: UUID['u-agent'] }]
  }
  if (sql.includes('FROM payments WHERE id')) return [{ unit_id: UN1, client_id: CA, party_user_id: UUID['u-t'] }]
  // Tenant maintenance tickets: unit agency, stored ticket link, leases.
  if (sql.startsWith('SELECT client_id::text AS client_id FROM units WHERE id')) {
    return params[0] === UN1 || params[0] === UN2 ? [{ client_id: CA }] : []
  }
  if (sql.startsWith('SELECT unit_id::text AS unit_id, lease_id::text AS lease_id FROM maintenance_tickets')) {
    const t = TICKET_LEASE[String(params[0])]
    return t ? [t] : []
  }
  if (sql.startsWith('SELECT lease_id::text AS lease_id FROM maintenance_tickets')) {
    const t = TICKET_LEASE[String(params[0])]
    return t ? [{ lease_id: t.lease_id }] : []
  }
  if (sql.startsWith('SELECT unit_id::text AS unit_id, client_id::text AS client_id, status FROM leases')) {
    const l = LEASE_ROWS[String(params[0])]
    return l ? [l] : []
  }
  if (sql.includes("FROM entity_id_map WHERE entity_type = 'tenancy'")) {
    const fe = FE_BY_UUID.get(String(params[0]))
    return fe ? [{ frontend_id: fe }] : []
  }
  if (sql.startsWith('SELECT id::text AS id FROM leases WHERE unit_id = $1::uuid AND tenant_id = $2::uuid')) {
    return params[0] === UN1 && params[1] === UUID['u-t'] ? [{ id: UUID['L-1'] }] : []
  }
  return []
}

/** Stored ticket → unit / lease link (maintenance_tickets.lease_id). */
const TICKET_LEASE: Record<string, { unit_id: string; lease_id: string | null }> = {
  [UUID['TK-mine']]: { unit_id: UN1, lease_id: null },
  [UUID['TK-linked']]: { unit_id: UN1, lease_id: UUID['L-1'] },
}
/** leases rows by uuid: unit, agency, status. */
const LEASE_ROWS: Record<string, { unit_id: string; client_id: string; status: string }> = {
  [UUID['L-1']]: { unit_id: UN1, client_id: CA, status: 'ACTIVE' },
  [UUID['L-pend']]: { unit_id: UN1, client_id: CA, status: 'PENDING' },
  [UUID['L-ended']]: { unit_id: UN1, client_id: CA, status: 'ENDED' },
  [UUID['L-cancel']]: { unit_id: UN1, client_id: CA, status: 'CANCELLED' },
  [UUID['L-notice']]: { unit_id: UN1, client_id: CA, status: 'NOTICE' },
  [UUID['L-unit2']]: { unit_id: UN2, client_id: CA, status: 'ACTIVE' },
  [UUID['L-otherag']]: { unit_id: UN1, client_id: id(2), status: 'ACTIVE' },
}

beforeEach(() => {
  resetModel()
  query.mockReset()
  query.mockImplementation(async (sql: string, params?: unknown[]) => answer(sql, params))
  resolveUuid.mockReset()
  resolveUuid.mockImplementation(async (_t: string, fe: string) => UUID[fe] ?? null)
  loadIdMapCache.mockReset()
  loadIdMapCache.mockResolvedValue({
    userBackendToFe: new Map([...FE_BY_UUID].filter(([, fe]) => fe.startsWith('u-'))),
    unitBackendToPropertyFe: new Map([
      [UN1, 'p-1'],
      [UN2, 'p-2'],
    ]),
    agencyBackendToFe: new Map([[CA, 'ag-a']]),
  })
})

afterEach(() => {
  vi.resetModules()
})

type Body = { resource: string; action: 'upsert' | 'delete'; id: string; data?: Record<string, unknown> }

async function gate(actor: { userId: string; role: string; agencyId: string | null }, body: Body) {
  const { assertPersistAllowed } = await import('./scopeGate.js')
  return assertPersistAllowed(actor as never, body as never)
}
const expect403 = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ status: 403 })

const TENANT = { userId: 'u-t', role: 'tenant', agencyId: 'ag-a' }
const LANDLORD = { userId: 'u-ll', role: 'landlord', agencyId: 'ag-a' }
const CONTRACTOR = { userId: 'u-co', role: 'contractor', agencyId: 'ag-a' }

describe('portal roles: writes outside the allow-list are refused', () => {
  it('a tenant cannot write properties, units, leases (beyond signing), documents, invoices, leads updates or lookups', async () => {
    const cases: Body[] = [
      { resource: 'property', action: 'upsert', id: 'p-1', data: { title: 'Mine now', rent: 1 } },
      { resource: 'unit', action: 'upsert', id: 'p-1', data: {} },
      { resource: 'tenancy', action: 'upsert', id: 'L-new', data: { propertyId: 'p-1', rent: 1 } },
      { resource: 'document', action: 'upsert', id: 'D-1', data: { propertyId: 'p-1' } },
      { resource: 'invoice', action: 'upsert', id: 'I-1', data: { agencyId: 'ag-a' } },
      { resource: 'lead', action: 'upsert', id: 'LD-1', data: { propertyId: 'p-1', stage: 'Won' } },
      { resource: 'lookup', action: 'upsert', id: 'LK-1', data: { clientId: 'ag-a' } },
      { resource: 'activity', action: 'upsert', id: 'AC-1', data: { agencyId: 'ag-a' } },
      { resource: 'agency', action: 'upsert', id: 'ag-a', data: {} },
      { resource: 'payment', action: 'upsert', id: 'PAY-new', data: { propertyId: 'p-1', amount: 1 } },
      { resource: 'viewing_slot', action: 'upsert', id: 'VS-new', data: { propertyId: 'p-1' } },
    ]
    for (const b of cases) await expect403(gate(TENANT, b))
    expect(writes).toEqual([])
  })

  it('portal users never delete (beyond their own notification)', async () => {
    for (const actor of [TENANT, LANDLORD, CONTRACTOR]) {
      for (const resource of ['application', 'ticket', 'message', 'property', 'viewing', 'tenancy', 'payment']) {
        await expect403(gate(actor, { resource, action: 'delete', id: 'X-1' }))
      }
    }
  })

  it('contractors and landlords get no payment, tenancy-edit, viewing or trust writes', async () => {
    await expect403(gate(CONTRACTOR, { resource: 'payment', action: 'upsert', id: 'PAY-1', data: { status: 'Paid' } }))
    await expect403(gate(CONTRACTOR, { resource: 'tenancy', action: 'upsert', id: 'L-1', data: {} }))
    await expect403(gate(CONTRACTOR, { resource: 'property', action: 'upsert', id: 'p-1', data: {} }))
    await expect403(gate(LANDLORD, { resource: 'payment', action: 'upsert', id: 'PAY-1', data: { status: 'Paid' } }))
    await expect403(gate(LANDLORD, { resource: 'viewing', action: 'upsert', id: 'VW-mine', data: {} }))
    await expect403(gate(LANDLORD, { resource: 'ticket', action: 'upsert', id: 'TK-job', data: {} }))
  })
})

describe('tenant allow-list: the real tenant flows still work, narrowly', () => {
  it('lease sign: only their own signature is merged into the stored envelope', async () => {
    const out = await gate(TENANT, {
      resource: 'tenancy',
      action: 'upsert',
      id: 'L-1',
      data: {
        id: 'L-1',
        rent: 1,
        endDate: '2099-01-01',
        eSign: {
          status: 'completed',
          envelopeId: 'ENV-1',
          tenant: { status: 'signed', signedAt: '2026-10-09T10:00:00Z', signerName: 'Tess', signatureDataUrl: 'data:sig' },
          landlord: { status: 'signed', signedAt: '2026-10-09T10:00:00Z', signerName: 'Forged' },
        },
      },
    })
    expect(out).toMatchObject({ handled: { ok: true, id: 'L-1' } })
    const upd = writes.find((w) => w.sql.startsWith('UPDATE leases'))!
    expect(upd.sql).toContain("jsonb_build_object('eSign', $2::jsonb)")
    expect(upd.sql).not.toMatch(/rent_amount|end_date/)
    const eSign = JSON.parse(String(upd.params[1]))
    expect(eSign.tenant).toEqual({ status: 'signed', signedAt: '2026-10-09T10:00:00Z', signerName: 'Tess', signatureDataUrl: 'data:sig' })
    expect(eSign.landlord).toEqual({ status: 'pending' }) // never from the tenant
    expect(eSign.status).toBe('partially_signed') // server-computed, not 'completed'
  })

  it("lease sign: another tenant's lease, or a lease with no issued envelope, is refused", async () => {
    await expect403(
      gate({ userId: 'u-t2', role: 'tenant', agencyId: 'ag-a' }, {
        resource: 'tenancy',
        action: 'upsert',
        id: 'L-1',
        data: { eSign: { envelopeId: 'ENV-1', tenant: { status: 'signed' } } },
      }),
    )
    leases[UUID['L-1']].metadata = {}
    await expect403(
      gate(TENANT, { resource: 'tenancy', action: 'upsert', id: 'L-1', data: { eSign: { envelopeId: 'ENV-X', tenant: { status: 'signed' } } } }),
    )
    expect(writes).toEqual([])
  })

  it('landlord countersign merges only the landlord block', async () => {
    await gate(LANDLORD, {
      resource: 'tenancy',
      action: 'upsert',
      id: 'L-1',
      data: { eSign: { envelopeId: 'ENV-1', tenant: { status: 'signed' }, landlord: { status: 'signed', signerName: 'Lan' } } },
    })
    const eSign = JSON.parse(String(writes.find((w) => w.sql.startsWith('UPDATE leases'))!.params[1]))
    expect(eSign.landlord).toEqual({ status: 'signed', signerName: 'Lan' })
    expect(eSign.tenant).toEqual({ status: 'pending' })
  })

  it('proof of payment updates only reference + notes on their own payment', async () => {
    const out = await gate(TENANT, {
      resource: 'payment',
      action: 'upsert',
      id: 'PAY-1',
      data: { id: 'PAY-1', status: 'Paid', amount: 1, paidAmount: 999999, reference: 'EFT-123', notes: 'Paid via EFT' },
    })
    expect(out).toMatchObject({ handled: { ok: true } })
    const upd = writes.find((w) => w.sql.startsWith('UPDATE payments'))!
    expect(upd.sql).not.toMatch(/status|amount|paid_at/)
    expect(upd.params.slice(1, 3)).toEqual(['EFT-123', 'Paid via EFT'])
    await expect403(gate(TENANT, { resource: 'payment', action: 'upsert', id: 'PAY-2', data: { reference: 'x' } }))
  })

  it('maintenance ticket / complaint: own create and own update pass, someone else\'s is refused', async () => {
    await expect(
      gate(TENANT, { resource: 'ticket', action: 'upsert', id: 'TK-new', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', title: 'Leak' } }),
    ).resolves.toEqual({})
    await expect(
      gate(TENANT, { resource: 'ticket', action: 'upsert', id: 'TK-mine', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t' } }),
    ).resolves.toEqual({})
    await expect403(
      gate(TENANT, { resource: 'ticket', action: 'upsert', id: 'TK-other', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t' } }),
    )
    await expect403(
      gate(TENANT, { resource: 'ticket', action: 'upsert', id: 'TK-new2', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t2' } }),
    )
  })

  it('viewing booking: only under their own email; someone else\'s booking is refused', async () => {
    await expect(
      gate(TENANT, { resource: 'viewing', action: 'upsert', id: 'VW-new', data: { propertyId: 'p-1', agencyId: 'ag-a', applicantEmail: 'TESS@x.test', slotId: 'VS-1' } }),
    ).resolves.toEqual({})
    await expect403(
      gate(TENANT, { resource: 'viewing', action: 'upsert', id: 'VW-new', data: { propertyId: 'p-1', agencyId: 'ag-a', applicantEmail: 'tom@x.test' } }),
    )
    await expect403(
      gate(TENANT, { resource: 'viewing', action: 'upsert', id: 'VW-other', data: { propertyId: 'p-1', agencyId: 'ag-a', applicantEmail: 'tess@x.test' } }),
    )
  })

  it('viewing slot: the booking write is a live recount, never the payload', async () => {
    const out = await gate(TENANT, {
      resource: 'viewing_slot',
      action: 'upsert',
      id: 'VS-1',
      data: { id: 'VS-1', booked: 0, capacity: 999, date: '2030-01-01', status: 'Open', agentId: 'u-t' },
    })
    expect(out).toMatchObject({ handled: { ok: true } })
    const upd = writes.find((w) => w.sql.startsWith('UPDATE viewing_slots'))!
    expect(upd.params).toEqual([UUID['VS-1'], 3])
    expect(upd.sql).not.toMatch(/capacity =|slot_date|agent_id/)
    await expect403(
      gate({ userId: 'u-t2', role: 'tenant', agencyId: 'ag-a' }, { resource: 'viewing_slot', action: 'upsert', id: 'VS-1', data: {} }),
    )
  })

  it('messages: only from themselves into a thread they are in', async () => {
    await expect(
      gate(TENANT, { resource: 'message', action: 'upsert', id: 'M-new', data: { threadId: 'TH-1', fromUserId: 'u-t', agencyId: 'ag-a', propertyId: 'p-1', body: 'hi' } }),
    ).resolves.toEqual({})
    await expect403(
      gate(TENANT, { resource: 'message', action: 'upsert', id: 'M-new', data: { threadId: 'TH-1', fromUserId: 'u-agent', agencyId: 'ag-a', propertyId: 'p-1' } }),
    )
    await expect403(
      gate(TENANT, { resource: 'message', action: 'upsert', id: 'M-new', data: { threadId: 'TH-2', fromUserId: 'u-t', agencyId: 'ag-a', propertyId: 'p-1' } }),
    )
    await expect403(
      gate(TENANT, { resource: 'thread', action: 'upsert', id: 'TH-2', data: { participantIds: ['u-t', 'u-agent'], agencyId: 'ag-a', propertyId: 'p-1' } }),
    )
  })
})

describe('landlord and contractor allow-lists', () => {
  it("a landlord edits their own listing, not another landlord's, and cannot hand it to someone else", async () => {
    await expect(gate(LANDLORD, { resource: 'property', action: 'upsert', id: 'p-1', data: { title: 'Nice', landlordId: 'u-ll', agencyId: 'ag-a' } })).resolves.toEqual({})
    await expect403(gate(LANDLORD, { resource: 'property', action: 'upsert', id: 'p-2', data: { title: 'Mine', agencyId: 'ag-a' } }))
    await expect403(gate(LANDLORD, { resource: 'property', action: 'upsert', id: 'p-1', data: { landlordId: 'u-ll2', agencyId: 'ag-a' } }))
  })

  it('a landlord cannot create applications (review only)', async () => {
    await expect403(gate(LANDLORD, { resource: 'application', action: 'upsert', id: 'A-new', data: { propertyId: 'p-1', agencyId: 'ag-a' } }))
  })

  it('a contractor updates their job but cannot reassign it, create or delete tickets', async () => {
    await expect(gate(CONTRACTOR, { resource: 'ticket', action: 'upsert', id: 'TK-job', data: { status: 'In Progress', contractorId: 'u-co' } })).resolves.toEqual({})
    await expect403(gate(CONTRACTOR, { resource: 'ticket', action: 'upsert', id: 'TK-job', data: { contractorId: 'u-co2' } }))
    await expect403(gate(CONTRACTOR, { resource: 'ticket', action: 'upsert', id: 'TK-brand-new', data: { propertyId: 'p-1', agencyId: 'ag-a' } }))
  })
})

describe("Follow-up: a tenant's own ticket never sets assignment, cost or status", () => {
  const LOCKED = {
    contractorId: 'u-co',
    assignedAgentId: 'u-agent',
    assignedTo: 'u-agent',
    cost: 9999,
    status: 'Completed',
    warrantyCovered: true,
    warranty_covered: true,
    escalatedAt: '2026-10-01T00:00:00Z',
    escalated_at: '2026-10-01T00:00:00Z',
  }

  it('update and create both strip contractorId, assignedAgentId, cost and status', async () => {
    const upd: Body = { resource: 'ticket', action: 'upsert', id: 'TK-mine', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', title: 'Leak', ...LOCKED } }
    await expect(gate(TENANT, upd)).resolves.toEqual({})
    // warrantyCovered is the server's value (no asset: not covered).
    expect(upd.data).toEqual({ propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', title: 'Leak', warrantyCovered: false })
    const created: Body = { resource: 'ticket', action: 'upsert', id: 'TK-new', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', ...LOCKED } }
    await expect(gate(TENANT, created)).resolves.toEqual({})
    // Server-stamped with the tenant's own lease on the unit (#92).
    expect(created.data).toEqual({ propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', tenancyId: 'L-1', warrantyCovered: false })
  })

  it('the stripped write keeps the stored assignment, cost and status (upsertTicket)', async () => {
    const body: Body = { resource: 'ticket', action: 'upsert', id: 'TK-mine', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', title: 'Leak', ...LOCKED } }
    await gate(TENANT, body)
    resolveUuid.mockImplementation(async (_t: string, fe: string) => (fe === 'p-1' ? UN1 : (UUID[fe] ?? null)))
    const { handlePersist } = await import('./writes.js')
    await handlePersist(body as never)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO maintenance_tickets'))!
    const sql = String(insert[0]).replace(/\s+/g, ' ')
    const params = insert[1] as unknown[]
    expect(sql).toContain('assigned_to = CASE WHEN $19::boolean THEN EXCLUDED.assigned_to ELSE maintenance_tickets.assigned_to END')
    expect(sql).toContain('contractor_id = CASE WHEN $20::boolean THEN EXCLUDED.contractor_id ELSE maintenance_tickets.contractor_id END')
    expect(sql).toContain('status = CASE WHEN $21::boolean THEN EXCLUDED.status ELSE maintenance_tickets.status END')
    expect(sql).toContain('cost_actual = CASE WHEN $22::boolean THEN EXCLUDED.cost_actual ELSE maintenance_tickets.cost_actual END')
    // A new tenant ticket goes to the unit's agent.
    expect(sql).toContain('CASE WHEN $19::boolean THEN $6::uuid ELSE (SELECT u.agent_id FROM units u WHERE u.id = $3::uuid) END')
    expect(params.slice(18, 22)).toEqual([false, false, false, false])
    expect(params).not.toContain(9999)
    expect(params[11]).toBe('OPEN')
  })

  it('#83: a tenant escalatedAt / warranty_covered is never used; the writer stores the server values', async () => {
    const body: Body = { resource: 'ticket', action: 'upsert', id: 'TK-mine', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', title: 'Leak', ...LOCKED } }
    await gate(TENANT, body)
    for (const k of ['escalatedAt', 'escalated_at', 'warranty_covered']) expect(body.data).not.toHaveProperty(k)
    expect((body.data as Record<string, unknown>).warrantyCovered).toBe(false)
    resolveUuid.mockImplementation(async (_t: string, fe: string) => (fe === 'p-1' ? UN1 : (UUID[fe] ?? null)))
    const { handlePersist } = await import('./writes.js')
    await handlePersist(body as never)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO maintenance_tickets'))!
    const sql = String(insert[0]).replace(/\s+/g, ' ')
    const params = insert[1] as unknown[]
    expect(sql).toContain('priority = CASE WHEN $23::boolean THEN EXCLUDED.priority ELSE maintenance_tickets.priority END')
    expect(sql).toContain('escalated_at = COALESCE(EXCLUDED.escalated_at, maintenance_tickets.escalated_at)')
    expect(params[13]).toBeNull() // escalated_at: stored value kept
    expect(params[12]).toBe(false) // warranty_covered: server value
    expect(params.slice(22, 24)).toEqual([false, true])
  })

  it('#83: a new tenant ticket is routed to the agency preferred vendor on the server (resolvePreferredVendor)', async () => {
    const { SEED_VENDOR_ROUTES, resolvePreferredVendor } = await import('../src/lib/maintenanceApi.js')
    const agencyFe = SEED_VENDOR_ROUTES[0].clientId
    const expected = resolvePreferredVendor(SEED_VENDOR_ROUTES, agencyFe, 'PLUMBING')
    expect(expected).toBeTruthy()
    resolveUuid.mockImplementation(async (t: string, fe: string) => {
      if (t === 'property' && fe === 'p-1') return UN1
      if (t === 'agency' && fe === agencyFe) return CA
      if (t === 'agency') return null
      return UUID[fe] ?? null
    })
    const base = query.getMockImplementation()!
    query.mockImplementation(async (sql: string, params?: unknown[]) =>
      /SELECT client_id::text AS client_id FROM units WHERE id = \$1::uuid/.test(sql) && params?.[0] === UN1
        ? [{ client_id: CA }]
        : base(sql, params),
    )
    const created: Body = {
      resource: 'ticket', action: 'upsert', id: 'TK-new',
      data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', categoryKey: 'PLUMBING', contractorId: 'u-co' },
    }
    await expect(gate(TENANT, created)).resolves.toEqual({})
    // The tenant's own pick is dropped; the server's routing wins.
    expect((created.data as Record<string, unknown>).contractorId).toBe(expected)

    // No route for the category: agency queue (no contractor).
    const general: Body = {
      resource: 'ticket', action: 'upsert', id: 'TK-new',
      data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', categoryKey: 'NO_SUCH_CATEGORY' },
    }
    await gate(TENANT, general)
    expect(general.data).not.toHaveProperty('contractorId')

    // An update of an existing ticket is never re-routed.
    const upd: Body = {
      resource: 'ticket', action: 'upsert', id: 'TK-mine',
      data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', categoryKey: 'PLUMBING' },
    }
    await gate(TENANT, upd)
    expect(upd.data).not.toHaveProperty('contractorId')
  })
})

describe('#83 (Angela 7ee4cf9): tenant ticket priority, warranty and escalation', () => {
  const ASSET = '00000000-0000-4000-8000-0000000000a1'
  const assets: Record<string, { warranty_expires_at: string | null; unit_id: string }> = {}
  let storedTicket: { priority: string; created_at: string; unit_id: string; asset_id: string | null } | null
  beforeEach(() => {
    storedTicket = null
    for (const k of Object.keys(assets)) delete assets[k]
    const base = query.getMockImplementation()!
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      const q = sql.replace(/\s+/g, ' ')
      if (q.startsWith('SELECT warranty_expires_at, unit_id::text AS unit_id FROM internal_assets')) {
        const a = assets[String(params?.[0])]
        return a ? [a] : []
      }
      if (q.startsWith('SELECT priority, created_at, unit_id::text AS unit_id, asset_id::text AS asset_id FROM maintenance_tickets')) {
        return storedTicket && params?.[0] === UUID['TK-mine'] ? [storedTicket] : []
      }
      return base(sql, params)
    })
    resolveUuid.mockImplementation(async (t: string, fe: string) => {
      if (t === 'property' && fe === 'p-1') return UN1
      if (t === 'asset' && fe === 'IA-geyser') return ASSET
      if (t === 'asset' && fe === 'IA-elsewhere') return '00000000-0000-4000-8000-0000000000a2'
      return UUID[fe] ?? null
    })
  })
  const newTicket = (extra: Record<string, unknown>): Body => ({
    resource: 'ticket', action: 'upsert', id: 'TK-new', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', title: 'Geyser', ...extra },
  })

  it('priority is accepted from Low / Medium / High / Emergency (any case) and stored as such', async () => {
    for (const [sent, kept] of [['Low', 'Low'], ['MEDIUM', 'Medium'], ['high', 'High'], ['EMERGENCY', 'Emergency']] as const) {
      const b = newTicket({ priority: sent })
      await gate(TENANT, b)
      expect((b.data as Record<string, unknown>).priority).toBe(kept)
    }
    const b = newTicket({ priority: 'EMERGENCY' })
    await gate(TENANT, b)
    const { handlePersist } = await import('./writes.js')
    await handlePersist(b as never)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO maintenance_tickets'))!
    expect((insert[1] as unknown[])[10]).toBe('EMERGENCY')
    expect((insert[1] as unknown[])[22]).toBe(true)
  })

  it('anything outside the list is a 400 TICKET_PRIORITY_INVALID (not a silent default)', async () => {
    for (const p of ['Urgent', 'Critical', '', 5, null]) {
      await expect(gate(TENANT, newTicket({ priority: p }))).rejects.toMatchObject({ status: 400, code: 'TICKET_PRIORITY_INVALID' })
    }
  })

  it('re-sending the stored priority (an Urgent set by staff) is no change; changing it must use the list', async () => {
    storedTicket = { priority: 'URGENT', created_at: '2026-10-01T08:00:00Z', unit_id: UN1, asset_id: null }
    const same: Body = { resource: 'ticket', action: 'upsert', id: 'TK-mine', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', priority: 'Urgent' } }
    await gate(TENANT, same)
    expect(same.data).not.toHaveProperty('priority')
    const up: Body = { resource: 'ticket', action: 'upsert', id: 'TK-mine', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', priority: 'Emergency' } }
    await gate(TENANT, up)
    expect((up.data as Record<string, unknown>).priority).toBe('Emergency')
  })

  it('complaint severity maps onto the list; Urgent escalates as Emergency', async () => {
    const { COMPLAINT_SEVERITY_TO_PRIORITY, tenantPriorityToApi, TENANT_TICKET_PRIORITIES } = await import('../src/lib/tenantTicketPriority.js')
    expect(COMPLAINT_SEVERITY_TO_PRIORITY).toEqual({ Low: 'Low', Medium: 'Medium', High: 'High', Urgent: 'Emergency' })
    expect([...TENANT_TICKET_PRIORITIES]).toEqual(['Low', 'Medium', 'High', 'Emergency'])
    const { toUiPriority, needsEmergencyEscalation } = await import('../src/lib/maintenanceApi.js')
    const ui = toUiPriority(tenantPriorityToApi(COMPLAINT_SEVERITY_TO_PRIORITY.Urgent))
    expect(ui).toBe('Emergency')
    const openedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    expect(needsEmergencyEscalation({ priority: ui, status: 'Requested', openedAt, escalatedAt: null })).toBe(true)
    // The API form of every complaint severity passes the server list.
    for (const sev of Object.keys(COMPLAINT_SEVERITY_TO_PRIORITY) as Array<keyof typeof COMPLAINT_SEVERITY_TO_PRIORITY>) {
      const b = newTicket({ priority: tenantPriorityToApi(COMPLAINT_SEVERITY_TO_PRIORITY[sev]) })
      await expect(gate(TENANT, b)).resolves.toEqual({})
    }
  })

  it('warranty_covered comes from the asset warranty on the ticket date, never from the tenant', async () => {
    const future = new Date(Date.now() + 365 * 86400000).toISOString()
    assets[ASSET] = { warranty_expires_at: future, unit_id: UN1 }
    const covered = newTicket({ internalAssetId: 'IA-geyser', warrantyCovered: false })
    await gate(TENANT, covered)
    expect((covered.data as Record<string, unknown>).warrantyCovered).toBe(true)

    assets[ASSET] = { warranty_expires_at: '2020-01-01T00:00:00Z', unit_id: UN1 }
    const expired = newTicket({ internalAssetId: 'IA-geyser', warrantyCovered: true, warranty_covered: true })
    await gate(TENANT, expired)
    expect((expired.data as Record<string, unknown>).warrantyCovered).toBe(false)

    // Existing ticket: judged on its own date (created_at), with the stored asset.
    assets[ASSET] = { warranty_expires_at: '2026-10-05T00:00:00Z', unit_id: UN1 }
    storedTicket = { priority: 'MEDIUM', created_at: '2026-10-01T08:00:00Z', unit_id: UN1, asset_id: ASSET }
    const upd: Body = { resource: 'ticket', action: 'upsert', id: 'TK-mine', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', warrantyCovered: false } }
    await gate(TENANT, upd)
    expect((upd.data as Record<string, unknown>).warrantyCovered).toBe(true)

    // No asset: not covered, whatever the tenant says.
    const none = newTicket({ warrantyCovered: true })
    await gate(TENANT, none)
    expect((none.data as Record<string, unknown>).warrantyCovered).toBe(false)
  })

  it('an asset on another unit (or unknown) is a 400', async () => {
    assets['00000000-0000-4000-8000-0000000000a2'] = { warranty_expires_at: null, unit_id: UN2 }
    await expect(gate(TENANT, newTicket({ internalAssetId: 'IA-elsewhere' }))).rejects.toMatchObject({ status: 400, code: 'TICKET_ASSET_NOT_ON_UNIT' })
    await expect(gate(TENANT, newTicket({ internalAssetId: 'IA-nope' }))).rejects.toMatchObject({ status: 400, code: 'TICKET_ASSET_NOT_ON_UNIT' })
  })
})

describe('#83 (Angela 7f151bb / Michael): tickets from the staff /new form, priority read-back', () => {
  const ticketInsert = () => {
    const calls = query.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO maintenance_tickets'))
    return calls[calls.length - 1]![1] as unknown[]
  }
  beforeEach(() => {
    resolveUuid.mockImplementation(async (t: string, fe: string) => (fe === 'p-1' ? UN1 : (UUID[fe] ?? null)))
  })

  /** createMaintenanceFromInput -> AppStore createMaintenanceTicket (buildTicketFromCreate) -> /api/persist. */
  async function createFromStaffForm(actorRole: string, actor: { userId: string; role: string; agencyId: string | null }, saveOk = true) {
    const { createMaintenanceFromInput } = await import('../src/lib/maintenanceTicketFlow.js')
    const { buildTicketFromCreate } = await import('../src/lib/maintenanceApi.js')
    let persisted: Record<string, unknown> | null = null
    const details: unknown[] = []
    const result = await createMaintenanceFromInput(
      { propertyId: 'p-1', title: 'Geyser burst', description: 'Water everywhere', priority: 'Urgent', categoryKey: 'PLUMBING', assetId: null },
      {
        properties: [{ id: 'p-1', unitId: 'unt-1' } as never],
        internalAssets: [],
        canMutate: () => true,
        createMaintenanceTicket: ({ actorUserId, propertyId, request }) => {
          const ticket = buildTicketFromCreate({
            id: 'TK-new', agencyId: 'ag-a', propertyId, unitId: request.unit_id, request,
            reportedBy: 'Tess', reportedByUserId: actorUserId, assignedAgentId: null, contractorId: null,
            warrantyCovered: false, assetLabel: request.title,
          })
          persisted = { ...ticket }
          return { status: 'TICKET_CREATED', ticket_id: ticket.id, saved: Promise.resolve(saveOk) }
        },
        updateMaintenanceTicketDetails: (...a: unknown[]) => void details.push(a),
        assignContractorToTicket: () => true,
        actorUserId: actor.userId,
        actorRole,
      },
    )
    const body: Body = { resource: 'ticket', action: 'upsert', id: 'TK-new', data: persisted! }
    await gate(actor, body)
    const { handlePersist } = await import('./writes.js')
    await handlePersist(body as never)
    return { result, details, body }
  }

  it('a tenant creating through the staff form with Urgent is stored as EMERGENCY (not a 400)', async () => {
    const { result } = await createFromStaffForm('tenant', TENANT)
    expect(result).toEqual({ ok: true, ticketId: 'TK-new' })
    expect(ticketInsert()[10]).toBe('EMERGENCY')
  })

  it('staff keep Urgent as URGENT', async () => {
    const { requestPriorityFor } = await import('../src/lib/maintenanceTicketFlow.js')
    expect(requestPriorityFor('Urgent', 'client_admin')).toBe('URGENT')
    expect(requestPriorityFor('Urgent', 'tenant')).toBe('EMERGENCY')
    expect(requestPriorityFor('Urgent', 'landlord')).toBe('EMERGENCY')
    expect(requestPriorityFor('High', 'tenant')).toBe('HIGH')
  })

  it('a refused create is reported as an error, not as logged, and no follow-up details are written', async () => {
    const { result, details } = await createFromStaffForm('tenant', TENANT, false)
    const { TICKET_NOT_SAVED_MESSAGE } = await import('../src/lib/maintenanceApi.js')
    expect(result).toEqual({ ok: false, error: TICKET_NOT_SAVED_MESSAGE })
    expect(details).toEqual([])
  })

  it('EMERGENCY round-trips: written, read back by bootstrap as Emergency / Requested, escalates, re-saved by staff as EMERGENCY', async () => {
    const STAFF = { userId: 'u-agent', role: 'agent', agencyId: 'ag-a' }
    const { handlePersist } = await import('./writes.js')
    await handlePersist({ resource: 'ticket', action: 'upsert', id: 'TK-mine', data: { propertyId: 'p-1', agencyId: 'ag-a', title: 'Geyser', priority: 'Emergency', status: 'Requested' } } as never)
    const written = ticketInsert()
    expect(written[10]).toBe('EMERGENCY')
    expect(written[11]).toBe('OPEN')

    const { ticketPriority, ticketStatus } = await import('./bootstrap.js')
    const priority = ticketPriority(String(written[10])) as 'Emergency'
    const status = ticketStatus(String(written[11])) as 'Requested'
    expect(priority).toBe('Emergency')
    expect(status).toBe('Requested')
    const { ticketPriority: sbPriority, ticketStatus: sbStatus } = await import('../src/lib/supabase/data.js')
    expect(sbPriority('EMERGENCY')).toBe('Emergency')
    expect(sbStatus('OPEN')).toBe('Requested')

    // Escalation keys on priority === 'Emergency' and status === 'Requested'.
    const { needsEmergencyEscalationPrecise } = await import('../src/lib/maintenanceApi.js')
    const openedAtIso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const reloaded = { id: 'TK-mine', priority, status, openedAt: openedAtIso.slice(0, 10), openedAtIso, escalatedAt: null }
    expect(needsEmergencyEscalationPrecise(reloaded as never)).toBe(true)

    // Staff save the reloaded ticket: still EMERGENCY.
    const body: Body = { resource: 'ticket', action: 'upsert', id: 'TK-mine', data: { propertyId: 'p-1', agencyId: 'ag-a', title: 'Geyser', priority, status } }
    await handlePersist(body as never)
    void STAFF
    expect(ticketInsert()[10]).toBe('EMERGENCY')
    expect(ticketInsert()[11]).toBe('OPEN')
  })
})

describe('tenant maintenance tickets: tenancy link and no-agency tenants', () => {
  const NO_AGENCY_TENANT = { userId: 'u-t', role: 'tenant', agencyId: null }
  const STAFF = { userId: 'u-agent', role: 'client_admin', agencyId: 'ag-a' }

  function noAgencyUsers() {
    const base = query.getMockImplementation()!
    query.mockImplementation(async (sql: string, params?: unknown[]) =>
      /SELECT client_id FROM users WHERE id/.test(sql) ? [{ client_id: null }] : base(sql, params),
    )
  }

  it('a tenant with no agency can file a ticket on their own property', async () => {
    noAgencyUsers()
    // The client sends the unit's agency (AppStore createMaintenanceTicket).
    const body: Body = { resource: 'ticket', action: 'upsert', id: 'TK-new', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', title: 'Leak' } }
    await expect(gate(NO_AGENCY_TENANT, body)).resolves.toEqual({})
  })

  it('Jim #92 nit: a tenant cannot file on a listing they only applied to (no lease on the unit)', async () => {
    const base = query.getMockImplementation()!
    query.mockImplementation(async (sql: string, params?: unknown[]) =>
      sql.replace(/\s+/g, ' ').includes('FROM applications a LEFT JOIN users u')
        ? [{ applicant_id: UUID['u-t'], email: 'tess@x.test', unit_id: UN2, status: 'SUBMITTED', reference_code: 'APP-9', metadata: null }]
        : base(sql, params),
    )
    const { buildActorPropertyScope } = await import('./scopeGate.js')
    const scope = await buildActorPropertyScope(TENANT as never)
    expect(scope.allowedPropertyIds.has('p-2')).toBe(true) // applied: in their book
    const body: Body = { resource: 'ticket', action: 'upsert', id: 'TK-new', data: { propertyId: 'p-2', agencyId: 'ag-a', reportedByUserId: 'u-t', title: 'Leak' } }
    await expect(gate(TENANT, body)).rejects.toMatchObject({ status: 403, message: expect.stringContaining('no lease on this unit') })
  })

  it('Jim #92 nit: upsertTicket keeps the stored asset when internalAssetId is absent', async () => {
    await staffPersist({ propertyId: 'p-1', title: 'Geyser' }, 'TK-mine')
    const sql = String(query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO maintenance_tickets'))![0]).replace(/\s+/g, ' ')
    expect(sql).toContain('asset_id = CASE WHEN $28::boolean THEN EXCLUDED.asset_id ELSE maintenance_tickets.asset_id END')
    expect(insertParams()[27]).toBe(false)
    query.mockClear()
    await staffPersist({ propertyId: 'p-1', title: 'Geyser', internalAssetId: null }, 'TK-mine')
    expect(insertParams()[27]).toBe(true)
  })

  it('a tenant with no agency still cannot file outside their book', async () => {
    noAgencyUsers()
    const body: Body = { resource: 'ticket', action: 'upsert', id: 'TK-new', data: { propertyId: 'p-2', reportedByUserId: 'u-t', title: 'Leak' } }
    await expect403(gate(NO_AGENCY_TENANT, body))
  })

  it("a new tenant ticket is stamped with the tenant's own lease on the unit", async () => {
    resolveUuid.mockImplementation(async (_t: string, fe: string) => (fe === 'p-1' ? UN1 : (UUID[fe] ?? null)))
    const body: Body = { resource: 'ticket', action: 'upsert', id: 'TK-new', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', title: 'Leak' } }
    await gate(TENANT, body)
    expect((body.data as Record<string, unknown>).tenancyId).toBe('L-1')
  })

  it("a tenant cannot file a ticket on someone else's tenancy", async () => {
    resolveUuid.mockImplementation(async (_t: string, fe: string) => (fe === 'p-1' ? UN1 : (UUID[fe] ?? null)))
    const body: Body = { resource: 'ticket', action: 'upsert', id: 'TK-new', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', tenancyId: 'L-pend' } }
    await expect403(gate(TENANT, body))
  })

  it('point 5: a tenant cannot change tenancyId after create', async () => {
    const move: Body = { resource: 'ticket', action: 'upsert', id: 'TK-mine', data: { propertyId: 'p-1', reportedByUserId: 'u-t', tenancyId: 'L-1' } }
    await expect403(gate(TENANT, move))
    // Re-sending the stored link (none) is no change and is dropped.
    const same: Body = { resource: 'ticket', action: 'upsert', id: 'TK-mine', data: { propertyId: 'p-1', reportedByUserId: 'u-t', tenancyId: null, title: 'Leak' } }
    await expect(gate(TENANT, same)).resolves.toEqual({})
    expect(same.data).not.toHaveProperty('tenancyId')
  })

  async function staffPersist(data: Record<string, unknown>, id = 'TK-staff') {
    resolveUuid.mockImplementation(async (_t: string, fe: string) => (fe === 'p-1' ? UN1 : fe === 'p-2' ? UN2 : (UUID[fe] ?? null)))
    const { handlePersist } = await import('./writes.js')
    return handlePersist({ resource: 'ticket', action: 'upsert', id, data } as never)
  }
  const insertParams = () =>
    query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO maintenance_tickets'))![1] as unknown[]

  it('staff link to an Active or Pending tenancy on the unit is stored as lease_id', async () => {
    await staffPersist({ propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-agent', title: 'Geyser', tenancyId: 'L-1' })
    expect(insertParams()[24]).toBe(UUID['L-1'])
    expect(insertParams()[25]).toBe(true)
    query.mockClear()
    await staffPersist({ propertyId: 'p-1', agencyId: 'ag-a', title: 'Geyser', tenancyId: 'L-pend' })
    expect(insertParams()[24]).toBe(UUID['L-pend'])
  })

  it('Jim #92 (1): a staff link to a Notice tenancy is allowed', async () => {
    await staffPersist({ propertyId: 'p-1', title: 'Geyser', tenancyId: 'L-notice' })
    expect(insertParams()[24]).toBe(UUID['L-notice'])
  })

  it('a tenant-view write without photos keeps the stored photos', async () => {
    await staffPersist({ propertyId: 'p-1', title: 'Geyser' }, 'TK-mine')
    const sql = String(query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO maintenance_tickets'))![0]).replace(/\s+/g, ' ')
    expect(sql).toContain('photos = CASE WHEN $27::boolean THEN EXCLUDED.photos ELSE maintenance_tickets.photos END')
    expect(insertParams()[26]).toBe(false)
  })

  it('point 3: a staff link to an Ended or Cancelled tenancy is refused (400)', async () => {
    for (const tenancyId of ['L-ended', 'L-cancel']) {
      await expect(staffPersist({ propertyId: 'p-1', agencyId: 'ag-a', title: 'Geyser', tenancyId })).rejects.toMatchObject({ status: 400 })
    }
  })

  it('an unchanged link to a lease that has since ended stays valid', async () => {
    LEASE_ROWS[UUID['L-1']].status = 'ENDED'
    try {
      await expect(staffPersist({ propertyId: 'p-1', title: 'Geyser', tenancyId: 'L-1' }, 'TK-linked')).resolves.toBeTruthy()
    } finally {
      LEASE_ROWS[UUID['L-1']].status = 'ACTIVE'
    }
  })

  it('a tenancy on another unit, in another agency, or unknown is a 400', async () => {
    for (const tenancyId of ['L-unit2', 'L-otherag', 'L-nope', id(99)]) {
      await expect(staffPersist({ propertyId: 'p-1', agencyId: 'ag-a', title: 'Geyser', tenancyId })).rejects.toMatchObject({ status: 400 })
    }
  })

  it('point 2: client_id comes from the unit, never the payload agencyId', async () => {
    await staffPersist({ propertyId: 'p-1', agencyId: 'ag-zzz', clientId: id(2), title: 'Geyser' })
    expect(insertParams()[1]).toBe(CA)
  })

  it('point 2: the write gate takes a ticket agency from the property, not the payload', async () => {
    const OTHER_AGENCY_STAFF = { userId: 'u-x', role: 'client_admin', agencyId: 'ag-b' }
    const body: Body = { resource: 'ticket', action: 'upsert', id: 'TK-new', data: { propertyId: 'p-1', agencyId: 'ag-b', title: 'x' } }
    await expect403(gate(OTHER_AGENCY_STAFF, body))
    await expect(gate(STAFF, { resource: 'ticket', action: 'upsert', id: 'TK-new', data: { propertyId: 'p-1', agencyId: 'ag-zzz', title: 'x' } })).resolves.toEqual({})
  })
})

describe('Jim #98: contractor access-notes writes', () => {
  it('the assigned contractor keeps accessNotes on save', async () => {
    const body = { resource: 'ticket', action: 'upsert' as const, id: 'TK-job', data: { status: 'In Progress', accessNotes: 'Gate 4411' } }
    await gate(CONTRACTOR, body)
    expect(body.data.accessNotes).toBe('Gate 4411')
  })

  it("an unassigned contractor's save drops accessNotes (stored value unchanged)", async () => {
    const other = { resource: 'ticket', action: 'upsert' as const, id: 'TK-job', data: { status: 'In Progress', accessNotes: 'hijack' } }
    await gate({ userId: 'u-co2', role: 'contractor', agencyId: 'ag-a' }, other).catch(() => undefined)
    expect(other.data).not.toHaveProperty('accessNotes')
    const pool = { resource: 'ticket', action: 'upsert' as const, id: 'TK-pool', data: { status: 'In Progress', accessNotes: 'hijack' } }
    await gate(CONTRACTOR, pool).catch(() => undefined)
    expect(pool.data).not.toHaveProperty('accessNotes')
  })
})

describe('staff ticket photos: a tenant save cannot change them', () => {
  it("a tenant saving their own ticket keeps the stored (staff) photos", async () => {
    for (const data of [
      { propertyId: 'p-1', reportedByUserId: 'u-t', title: 'Leak', photoUrls: [] },
      { propertyId: 'p-1', reportedByUserId: 'u-t', title: 'Leak', photos: [] },
      { propertyId: 'p-1', reportedByUserId: 'u-t', title: 'Leak', photoUrls: ['https://evil.example/x.jpg'], photos: 1 },
    ]) {
      const body: Body = { resource: 'ticket', action: 'upsert', id: 'TK-mine', data }
      await expect(gate(TENANT, body)).resolves.toEqual({})
      expect(body.data).not.toHaveProperty('photoUrls')
      expect(body.data).not.toHaveProperty('photos')
    }
  })
})
