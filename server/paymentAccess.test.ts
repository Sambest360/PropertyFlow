import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

vi.hoisted(() => {
  process.env.AUTH_SECRET = 'payment-access-test-secret'
})

const db = vi.hoisted(() => ({
  query: vi.fn(),
}))

const CLIENT_A = 'a1000001-0001-4000-8000-000000000001'
const CLIENT_B = 'a1000001-0001-4000-8000-000000000002'
const PAYMENT = 'a1000001-0001-4000-8000-000000000099'
const STAFF_USER = 'a2000001-0001-4000-8000-0000000000aa'
const TENANT_USER = 'a2000001-0001-4000-8000-0000000000bb'

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  databaseConfigError: undefined,
  databaseConfigWarning: undefined,
  pool: null,
  query: db.query,
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pingDatabase: vi.fn(),
}))

vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => {}),
  ensureUuid: vi.fn(async () => PAYMENT),
  forgetId: vi.fn(async () => {}),
  isUuid: (id: string | null | undefined) => Boolean(id && /^[0-9a-f-]{36}$/i.test(id)),
  resolveUuid: vi.fn(async (type: string, id: string | null) => {
    if (!id) return null
    if (type === 'agency' && id === 'ag-horizon') return CLIENT_A
    if (type === 'agency' && id === 'ag-cape') return CLIENT_B
    if (type === 'payment') return PAYMENT
    if (type === 'user') return STAFF_USER
    return null
  }),
}))

import { createSessionToken } from './auth.js'
import { markPaymentPaidRoute } from './paymentMarkPaid.js'
import { handlePersist } from './writes.js'

type PaymentRow = {
  id: string
  client_id: string
  status: string
  amount: string
  reference: string | null
}

let existing: PaymentRow | null = null
let sessionRole = 'tenant'
let sessionUser = TENANT_USER
let sessionAgency = 'ag-horizon'
let sqlLog: { sql: string; params: unknown[] }[] = []

function paymentData(overrides: Record<string, unknown> = {}) {
  return {
    agencyId: 'ag-horizon',
    partyName: 'Tenant',
    type: 'Rent',
    amount: 1,
    status: 'Paid',
    reference: 'hacked',
    paidAt: '2026-09-29',
    paidAmount: 1,
    dueDate: '2026-10-01',
    ...overrides,
  }
}

beforeEach(() => {
  existing = {
    id: PAYMENT,
    client_id: CLIENT_A,
    status: 'DUE',
    amount: '1500.00',
    reference: 'INV-1',
  }
  sessionRole = 'tenant'
  sessionUser = TENANT_USER
  sessionAgency = 'ag-horizon'
  sqlLog = []
  db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const text = sql.replace(/\s+/g, ' ')
    sqlLog.push({ sql: text, params })
    if (/password_hash/i.test(text)) {
      return [
        {
          id: sessionUser,
          email: 'user@example.com',
          password_hash: 'x',
          first_name: 'Test',
          last_name: 'User',
          phone: null,
          role: 'END_USER',
          active: true,
          client_id: sessionAgency === 'ag-cape' ? CLIENT_B : CLIENT_A,
          metadata: { frontend_id: 'u-session', frontend_role: sessionRole },
          agency_fe: sessionAgency,
        },
      ]
    }
    if (/FROM payments/i.test(text)) return existing ? [existing] : []
    return []
  })
})

function inserts() {
  return sqlLog.filter((entry) => entry.sql.includes('INSERT INTO payments'))
}

function updates() {
  return sqlLog.filter((entry) => entry.sql.includes('UPDATE payments'))
}

describe('generic payment persist', () => {
  it('a tenant cannot change amount or status', async () => {
    const result = await handlePersist(
      { resource: 'payment', action: 'upsert', id: 'pay-1', data: paymentData() },
      { role: 'tenant', userId: 'u-tenant', agencyId: 'ag-horizon' },
    )
    expect(result.ok).toBe(true)
    const insert = inserts()[0]
    expect(insert).toBeTruthy()
    expect(insert.sql).not.toContain('amount = EXCLUDED.amount')
    expect(insert.sql).not.toContain('status = EXCLUDED.status')
    expect(insert.sql).not.toContain('paid_at = EXCLUDED.paid_at')
    expect(insert.sql).not.toContain('paid_amount = EXCLUDED.paid_amount')
    expect(insert.sql).not.toContain('reference = EXCLUDED.reference')
    expect(insert.params[8]).toBe(1500)
    expect(insert.params[9]).toBeNull()
    expect(insert.params[10]).toBe('DUE')
    expect(insert.params[12]).toBeNull()
    expect(insert.params[14]).toBe('INV-1')
  })

  it('a landlord cannot change amount or status', async () => {
    await handlePersist(
      { resource: 'payment', action: 'upsert', id: 'pay-1', data: paymentData({ amount: 5, status: 'Cancelled' }) },
      { role: 'landlord', userId: 'u-landlord', agencyId: 'ag-horizon' },
    )
    const insert = inserts()[0]
    expect(insert.params[8]).toBe(1500)
    expect(insert.params[10]).toBe('DUE')
    expect(insert.sql).not.toContain('status = EXCLUDED.status')
    expect(insert.sql).not.toContain('amount = EXCLUDED.amount')
  })

  it('refuses a cross-agency persist', async () => {
    await expect(
      handlePersist(
        { resource: 'payment', action: 'upsert', id: 'pay-1', data: paymentData({ agencyId: 'ag-cape', amount: 9 }) },
        { role: 'client_admin', userId: 'u-cape', agencyId: 'ag-cape' },
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(inserts()).toHaveLength(0)
    expect(updates()).toHaveLength(0)
  })

  it('lets same-agency staff set amount and status only when creating a payment', async () => {
    existing = null
    await handlePersist(
      {
        resource: 'payment',
        action: 'upsert',
        id: 'pay-new',
        data: paymentData({ amount: 1500, status: 'Due', reference: 'INV-9' }),
      },
      { role: 'agent_admin', userId: 'u-staff', agencyId: 'ag-horizon' },
    )
    const insert = inserts()[0]
    expect(insert.params[8]).toBe(1500)
    expect(insert.params[10]).toBe('DUE')
    expect(insert.params[12]).toBeNull()
    expect(insert.params[9]).toBeNull()

    sqlLog = []
    existing = null
    await expect(
      handlePersist(
        { resource: 'payment', action: 'upsert', id: 'pay-paid', data: paymentData({ amount: 1500, status: 'Paid' }) },
        { role: 'client_admin', userId: 'u-staff', agencyId: 'ag-horizon' },
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(inserts()).toHaveLength(0)
  })
})

describe('staff mark-paid', () => {
  function app() {
    const hono = new Hono()
    hono.post('/api/payments/:id/mark-paid', (c) => markPaymentPaidRoute(c))
    return hono
  }

  function token() {
    return createSessionToken({
      id: sessionUser,
      frontendId: 'u-session',
      role: sessionRole,
      agencyId: sessionAgency,
    })
  }

  async function post(body: Record<string, unknown>) {
    return app().request(`/api/payments/${PAYMENT}/mark-paid`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify(body),
    })
  }

  it('a tenant cannot mark a payment paid', async () => {
    sessionRole = 'tenant'
    sessionUser = TENANT_USER
    const res = await post({ method: 'EFT', paidAmount: 1, recordedByUserId: 'someone-else' })
    expect(res.status).toBe(403)
    expect(updates()).toHaveLength(0)
  })

  it('a landlord cannot mark a payment paid', async () => {
    sessionRole = 'landlord'
    sessionUser = 'a2000001-0001-4000-8000-0000000000cc'
    const res = await post({ method: 'EFT', status: 'Paid', amount: 1 })
    expect(res.status).toBe(403)
    expect(updates()).toHaveLength(0)
  })

  it('refuses a cross-agency staff mark-paid', async () => {
    sessionRole = 'client_admin'
    sessionUser = STAFF_USER
    sessionAgency = 'ag-cape'
    const res = await post({ method: 'EFT', paidAmount: 1500 })
    expect(res.status).toBe(403)
    expect(updates()).toHaveLength(0)
  })

  it('records the session staff user when marking EFT paid', async () => {
    sessionRole = 'ground_agent'
    sessionUser = STAFF_USER
    sessionAgency = 'ag-horizon'
    const res = await post({
      method: 'EFT',
      paidAmount: 1500,
      paidAt: '2026-09-29',
      reference: 'EFT-1',
      recordedByUserId: 'someone-else',
    })
    expect(res.status).toBe(200)
    const update = updates()[0]
    expect(update.sql).toContain("status = 'PAID'")
    expect(update.sql).toContain('recorded_by = $8::uuid')
    expect(update.params[7]).toBe(STAFF_USER)
    expect(update.params).not.toContain('someone-else')
    expect(update.params[2]).toBe(1500)
  })
})
