import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readTicketAccessNotes,
  resetTicketAccessNotesCache,
  ticketAccessNotesColumnExists,
  writeTicketAccessNotes,
} from './ticketAccessNotes'
import { staffTicketAccessNotes, filterBootstrapForActor } from './scopeGate'
import { tenantTicketView } from '../src/lib/ticketTenantView'
import { buildPropertyScope } from '../src/lib/scope'
import type { DemoActor } from './actor'

vi.mock('./db.js', () => ({ query: vi.fn(async () => []) }))

const UUID = '00000000-0000-4000-8000-0000000000aa'

function fakeDb(columnPresent: boolean) {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  const q = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params })
    if (sql.includes('information_schema')) return columnPresent ? [{ '?column?': 1 }] : []
    return []
  })
  return { q, calls, updates: () => calls.filter((c) => c.sql.includes('UPDATE maintenance_tickets')) }
}

beforeEach(() => resetTicketAccessNotesCache())

describe('upsertTicket access_notes write', () => {
  it('writes accessNotes when sent', async () => {
    const db = fakeDb(true)
    await writeTicketAccessNotes(UUID, { accessNotes: '  Gate 4411  ' }, db.q)
    expect(db.updates()).toHaveLength(1)
    expect(db.updates()[0].params).toEqual([UUID, 'Gate 4411'])
  })

  it('absent accessNotes keeps the stored value (no write)', async () => {
    const db = fakeDb(true)
    await writeTicketAccessNotes(UUID, { title: 'x' }, db.q)
    expect(db.updates()).toHaveLength(0)
  })

  it("explicit '' or null clears it", async () => {
    const db = fakeDb(true)
    await writeTicketAccessNotes(UUID, { accessNotes: '' }, db.q)
    await writeTicketAccessNotes(UUID, { accessNotes: null }, db.q)
    expect(db.updates().map((u) => u.params)).toEqual([
      [UUID, null],
      [UUID, null],
    ])
  })
})

describe('column absent (migration 013 not applied)', () => {
  it('skips the write with no error and checks information_schema once per process', async () => {
    const db = fakeDb(false)
    await expect(writeTicketAccessNotes(UUID, { accessNotes: 'Gate' }, db.q)).resolves.toBeUndefined()
    await writeTicketAccessNotes(UUID, { accessNotes: 'Gate 2' }, db.q)
    expect(db.updates()).toHaveLength(0)
    expect(db.calls.filter((c) => c.sql.includes('information_schema'))).toHaveLength(1)
    expect(await ticketAccessNotesColumnExists(db.q)).toBe(false)
  })

  it('read skips the field when the row has no access_notes column', () => {
    expect(readTicketAccessNotes({ id: 't', title: 'x' })).toBeUndefined()
  })

  it('a failed check reports unsupported without throwing', async () => {
    const q = vi.fn(async () => {
      throw new Error('boom')
    })
    await expect(ticketAccessNotesColumnExists(q)).resolves.toBe(false)
  })
})

describe('bootstrap read and visibility', () => {
  it('maps access_notes to accessNotes', () => {
    expect(readTicketAccessNotes({ access_notes: 'Dog in yard' })).toBe('Dog in yard')
    expect(readTicketAccessNotes({ access_notes: null })).toBeUndefined()
  })

  const ticket = { id: 'MT-1', title: 'Leak', reportedByUserId: 'u-t', contractorId: 'u-co', accessNotes: 'Gate 4411' }

  it("tenant: kept on their own report, stripped on a staff-linked ticket", () => {
    expect(tenantTicketView(ticket, new Set(['u-t'])).accessNotes).toBe('Gate 4411')
    const linked = tenantTicketView({ ...ticket, reportedByUserId: 'u-agent', tenancyId: 'L-t' }, new Set(['u-t']))
    expect(linked).not.toHaveProperty('accessNotes')
  })

  it('staff see access notes', () => {
    expect(staffTicketAccessNotes(ticket, 'ground_agent', new Set(['u-agent'])).accessNotes).toBe('Gate 4411')
    expect(staffTicketAccessNotes(ticket, 'client_admin', new Set(['u-adm'])).accessNotes).toBe('Gate 4411')
  })

  it('the assigned contractor sees access notes; another contractor does not', () => {
    expect(staffTicketAccessNotes(ticket, 'contractor', new Set(['u-co'])).accessNotes).toBe('Gate 4411')
    expect(staffTicketAccessNotes(ticket, 'contractor', new Set(['u-co2']))).not.toHaveProperty('accessNotes')
  })

  it('landlords get access notes stripped', () => {
    expect(staffTicketAccessNotes(ticket, 'landlord', new Set(['u-ll']))).not.toHaveProperty('accessNotes')
  })

  it('filterBootstrapForActor: landlord bootstrap strips accessNotes', () => {
    const data = {
      source: 'test',
      fetchedAt: '2026-10-10T00:00:00.000Z',
      ticketAccessNotesSupported: true,
      agencies: [{ id: 'ag-a', status: 'Active' }],
      users: [{ id: 'u-ll' }],
      buildings: [{ id: 'b-a', clientId: 'ag-a' }],
      units: [],
      properties: [{ id: 'p-1', agencyId: 'ag-a', agentId: 'u-agent', landlordId: 'u-ll', buildingId: 'b-a' }],
      leads: [],
      applications: [],
      tenancies: [],
      viewings: [],
      viewingSlots: [],
      payments: [],
      propertyDocuments: [],
      tickets: [{ ...ticket, agencyId: 'ag-a', propertyId: 'p-1', tenancyId: null }],
      threads: [],
      messages: [],
      notifications: [],
    }
    const actor = { userId: 'u-ll', role: 'landlord', agencyId: 'ag-a' } as DemoActor
    const scope = buildPropertyScope(
      { role: 'landlord', userId: 'u-ll', agencyId: 'ag-a', agencySuspended: false },
      { properties: data.properties, tenancies: [] } as never,
    )
    const out = filterBootstrapForActor(data as never, actor, scope) as unknown as {
      tickets: Array<Record<string, unknown>>
      ticketAccessNotesSupported?: boolean
    }
    expect(out.tickets).toHaveLength(1)
    for (const t of out.tickets) expect(t).not.toHaveProperty('accessNotes')
    expect(out.ticketAccessNotesSupported).toBe(true)
  })
})
