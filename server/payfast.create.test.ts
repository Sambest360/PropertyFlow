import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

vi.hoisted(() => {
  process.env.AUTH_SECRET = 'payfast-create-test-secret'
})

const db = vi.hoisted(() => ({
  query: vi.fn(),
}))

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

vi.mock('./mailtrap.js', () => ({
  sendPaymentReceipt: vi.fn(),
}))

import { createSessionToken } from './auth.js'
import { payfastCreate } from './payfastRoutes.js'

const USER = 'a2000001-0001-4000-8000-000000000010'
const PAYMENT = 'a1000001-0001-4000-8000-000000000099'
const CLIENT = 'a1000001-0001-4000-8000-000000000001'
const MERCHANT_ID = '10000100'
const MERCHANT_KEY = '46f0cd694581a'
const PASSPHRASE = 'jt7NOE43FZPn'

function app() {
  const hono = new Hono()
  hono.post('/api/payfast/create', (c) => payfastCreate(c))
  return hono
}

beforeEach(() => {
  process.env.PAYFAST_MERCHANT_ID = MERCHANT_ID
  process.env.PAYFAST_MERCHANT_KEY = MERCHANT_KEY
  process.env.PAYFAST_PASSPHRASE = PASSPHRASE
  process.env.PAYFAST_MODE = 'sandbox'
  db.query.mockImplementation(async (sql: string) => {
    if (/password_hash/i.test(sql)) {
      return [
        {
          id: USER,
          email: 'payer@example.com',
          password_hash: 'x',
          first_name: 'Pat',
          last_name: 'Payer',
          phone: null,
          role: 'END_USER',
          active: true,
          client_id: CLIENT,
          metadata: { frontend_id: 'u-tenant', frontend_role: 'tenant' },
          agency_fe: 'ag-horizon',
        },
      ]
    }
    if (/FROM payments/i.test(sql)) {
      return [
        {
          id: PAYMENT,
          amount: '10.00',
          status: 'DUE',
          payment_type: 'RENT',
          party_name: 'Pat Payer',
          party_user_id: USER,
          client_id: CLIENT,
          unit_id: null,
        },
      ]
    }
    return []
  })
})

describe('POST /api/payfast/create', () => {
  it('ignores subscription fields on the request body', async () => {
    const token = createSessionToken({
      id: USER,
      frontendId: 'u-tenant',
      role: 'tenant',
      agencyId: 'ag-horizon',
    })
    const res = await app().request('/api/payfast/create', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        paymentId: PAYMENT,
        amountCents: 1,
        subscription: {
          cycles: '12',
          frequency: 3,
          subscription_type: '1',
          recurring_amount: '999.00',
          billing_date: '2026-01-01',
        },
      }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { fields: Record<string, string> }
    expect(body.fields.amount).toBe('10.00')
    expect(body.fields).not.toHaveProperty('subscription_type')
    expect(body.fields).not.toHaveProperty('billing_date')
    expect(body.fields).not.toHaveProperty('recurring_amount')
    expect(body.fields).not.toHaveProperty('frequency')
    expect(body.fields).not.toHaveProperty('cycles')
    expect(JSON.stringify(body.fields)).not.toContain(PASSPHRASE)
  })
})
