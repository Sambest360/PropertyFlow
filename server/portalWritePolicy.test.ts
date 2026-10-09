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
  'VW-mine': id(60),
  'VW-other': id(61),
  'VS-1': id(70),
  'TH-1': id(80),
  'TH-2': id(81),
  'LD-1': id(90),
  'ag-a': CA,
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
  return []
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
  const LOCKED = { contractorId: 'u-co', assignedAgentId: 'u-agent', assignedTo: 'u-agent', cost: 9999, status: 'Completed' }

  it('update and create both strip contractorId, assignedAgentId, cost and status', async () => {
    const upd: Body = { resource: 'ticket', action: 'upsert', id: 'TK-mine', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', title: 'Leak', ...LOCKED } }
    await expect(gate(TENANT, upd)).resolves.toEqual({})
    expect(upd.data).toEqual({ propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', title: 'Leak' })
    const created: Body = { resource: 'ticket', action: 'upsert', id: 'TK-new', data: { propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t', ...LOCKED } }
    await expect(gate(TENANT, created)).resolves.toEqual({})
    expect(created.data).toEqual({ propertyId: 'p-1', agencyId: 'ag-a', reportedByUserId: 'u-t' })
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
})
