import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  process.env.AUTH_SECRET = 'bootstrap-scope-test-secret'
  delete process.env.SUPABASE_URL
  delete process.env.VITE_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
})

const db = vi.hoisted(() => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pingDatabase: vi.fn(),
}))

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  databaseConfigError: undefined,
  databaseConfigWarning: undefined,
  pool: { end: async () => {} },
  query: db.query,
  withTransaction: db.withTransaction,
  clientQuery: db.clientQuery,
  pingDatabase: db.pingDatabase,
}))

import { createSessionToken } from './auth.js'
import app from './index.js'

const CLIENT_A = 'a1000001-0001-4000-8000-000000000001'
const CLIENT_B = 'a1000001-0001-4000-8000-000000000002'
const USER_A = 'a2000001-0001-4000-8000-000000000002'
const LEAK = 'AGENCY_B_LEAK'

function isSessionLookup(sql: string): boolean {
  return /password_hash/i.test(sql)
}

function isDdl(sql: string): boolean {
  return /^(CREATE|INSERT|UPDATE|DELETE|ALTER)\b/i.test(sql.replace(/\s+/g, ' ').trim())
}

beforeEach(() => {
  db.query.mockReset()
  db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const text = sql.replace(/\s+/g, ' ').trim()
    if (isDdl(text)) return []
    if (isSessionLookup(text)) {
      return [
        {
          id: USER_A,
          email: 'amelia@horizonrealty.co.za',
          password_hash: 'x',
          first_name: 'Amelia',
          last_name: 'Nkosi',
          phone: null,
          role: 'AGENCY_ADMIN',
          active: true,
          client_id: CLIENT_A,
          metadata: { frontend_id: 'u-amelia' },
          agency_fe: 'ag-horizon',
        },
      ]
    }
    if (!params.includes(CLIENT_A)) {
      throw new Error(`unscoped query: ${text}`)
    }
    if (params.includes(CLIENT_B) && !text.includes('INSERT')) {
      throw new Error(`query included agency B: ${text}`)
    }
    if (/FROM clients/i.test(text) && /company_name/i.test(text)) {
      return [
        {
          id: CLIENT_A,
          company_name: 'Horizon Realty',
          subdomain: 'horizon',
          status: 'active',
          city: 'Gqeberha',
          created_at: new Date('2026-01-01T00:00:00Z'),
        },
      ]
    }
    if (/SELECT status FROM clients/i.test(text)) return [{ status: 'active' }]
    if (/FROM leads/i.test(text)) {
      return [
        {
          id: 'b1000001-0001-4000-8000-0000000000a1',
          client_id: CLIENT_A,
          unit_id: null,
          agent_id: null,
          name: 'Horizon Lead',
          email: 'lead@horizon.test',
          phone: '',
          channel: 'web',
          stage: 'NEW',
          interest_type: 'RENT',
          value_amount: 0,
          notes: '',
          metadata: null,
          created_at: new Date('2026-01-02T00:00:00Z'),
          updated_at: new Date('2026-01-02T00:00:00Z'),
        },
      ]
    }
    if (/FROM entity_id_map/i.test(text)) {
      return [{ entity_type: 'agency', frontend_id: 'ag-horizon', backend_id: CLIENT_A }]
    }
    if (/FROM users/i.test(text)) {
      return [
        {
          id: USER_A,
          client_id: CLIENT_A,
          email: 'amelia@horizonrealty.co.za',
          first_name: 'Amelia',
          last_name: 'Nkosi',
          phone: null,
          role: 'AGENCY_ADMIN',
          active: true,
          metadata: { frontend_id: 'u-amelia' },
        },
      ]
    }
    return []
  })
})

describe('GET /api/bootstrap scope', () => {
  it('returns 401 for an anonymous caller and issues no database query', async () => {
    db.query.mockClear()
    const res = await app.request('/api/bootstrap')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
    expect(db.query).not.toHaveBeenCalled()
  })

  it('gives agency A staff none of agency B rows', async () => {
    const token = createSessionToken({
      id: USER_A,
      frontendId: 'u-amelia',
      role: 'client_admin',
      agencyId: 'ag-horizon',
    })
    const res = await app.request('/api/bootstrap', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    const encoded = JSON.stringify(body)
    expect(encoded).not.toContain(CLIENT_B)
    expect(encoded).not.toContain('ag-cape')
    expect(encoded).not.toContain(LEAK)
    expect(encoded).toContain('ag-horizon')
    const agencyIds = (body.agencies as Array<{ id: string }>).map((a) => a.id)
    expect(agencyIds).toEqual(['ag-horizon'])
    const leads = body.leads as Array<{ agencyId?: string; name?: string }>
    expect(leads.every((lead) => lead.agencyId === 'ag-horizon')).toBe(true)
    expect(leads.some((lead) => lead.name === 'Horizon Lead')).toBe(true)

    const selects = db.query.mock.calls.filter(([sql]) => {
      const text = String(sql).replace(/\s+/g, ' ').trim()
      return /^SELECT/i.test(text) && !isSessionLookup(text)
    })
    expect(selects.length).toBeGreaterThan(5)
    for (const [sql, params] of selects) {
      const text = String(sql)
      expect(params, text).toContain(CLIENT_A)
      expect(text.toLowerCase()).toMatch(/client_id|where id/)
    }
  })
})
