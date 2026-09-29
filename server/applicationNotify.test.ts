import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

vi.hoisted(() => {
  process.env.AUTH_SECRET = 'application-notify-test-secret'
  process.env.AUTH_RATE_LIMIT_NOTIFY_MAX = '30'
})

const db = vi.hoisted(() => ({
  query: vi.fn(),
}))

const mail = vi.hoisted(() => ({
  sendApplicationReceived: vi.fn(async () => ({ ok: true })),
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
  sendApplicationReceived: mail.sendApplicationReceived,
}))

import { createSessionToken } from './auth.js'
import { notifyApplicationReceived } from './applicationNotify.js'

const APPLICANT = 'a2000001-0001-4000-8000-000000000010'
const OTHER = 'a2000001-0001-4000-8000-000000000011'
const CLIENT = 'a1000001-0001-4000-8000-000000000001'
const APP_ID = 'a3000001-0001-4000-8000-000000000099'
const REF = 'APP-abc123'

let sentAt: string | null = null
let scenario: 'own' | 'other' | 'missing' = 'own'

function app() {
  const hono = new Hono()
  hono.post('/api/notify/application-received', (c) => notifyApplicationReceived(c))
  return hono
}

function token() {
  return createSessionToken({
    id: APPLICANT,
    frontendId: 'u-applicant',
    role: 'tenant',
    agencyId: 'ag-horizon',
  })
}

async function post(body: unknown, auth = true) {
  return app().request('/api/notify/application-received', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: `Bearer ${token()}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  sentAt = null
  scenario = 'own'
  mail.sendApplicationReceived.mockClear()
  db.query.mockReset()
  db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const text = sql.replace(/\s+/g, ' ')
    if (/password_hash/i.test(text)) {
      return [
        {
          id: String(params[0]),
          email: 'session@example.com',
          password_hash: 'x',
          first_name: 'Session',
          last_name: 'User',
          phone: null,
          role: 'END_USER',
          active: true,
          client_id: CLIENT,
          metadata: { frontend_id: 'u-applicant', frontend_role: 'tenant' },
          agency_fe: 'ag-horizon',
        },
      ]
    }
    if (/FROM applications/i.test(text)) {
      expect(text).toContain('a.client_id = caller.client_id')
      expect(params[1]).toBe(APPLICANT)
      if (scenario === 'missing' || params[0] !== REF) return []
      return [
        {
          id: APP_ID,
          client_id: CLIENT,
          applicant_id: scenario === 'other' ? OTHER : APPLICANT,
          reference_code: REF,
          received_email_at: sentAt,
          email: 'db-applicant@example.com',
          first_name: 'Db',
          last_name: 'Applicant',
          unit_title: 'Db Property',
        },
      ]
    }
    if (/UPDATE applications/i.test(text)) {
      expect(text).toContain('received_email_at IS NULL')
      expect(text).toContain('client_id = $2')
      expect(params).toEqual([APP_ID, CLIENT])
      if (sentAt) return []
      sentAt = '2026-09-29T00:00:00.000Z'
      return [{ id: APP_ID }]
    }
    return []
  })
})

describe('POST /api/notify/application-received', () => {
  it('returns 401 for an anonymous call and does not touch the database or send mail', async () => {
    const res = await post({ referenceCode: REF }, false)
    expect(res.status).toBe(401)
    expect(db.query).not.toHaveBeenCalled()
    expect(mail.sendApplicationReceived).not.toHaveBeenCalled()
  })

  it('returns 403 for another person application in the same agency', async () => {
    scenario = 'other'
    const res = await post({ referenceCode: REF })
    expect(res.status).toBe(403)
    expect(mail.sendApplicationReceived).not.toHaveBeenCalled()
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE applications'))).toBe(false)
  })

  it('returns 404 for an unknown reference without sending mail', async () => {
    scenario = 'missing'
    const res = await post({ referenceCode: 'APP-nope' })
    expect(res.status).toBe(404)
    expect(mail.sendApplicationReceived).not.toHaveBeenCalled()
  })

  it('returns 400 when the body contains anything besides referenceCode', async () => {
    const res = await post({
      referenceCode: REF,
      email: 'attacker@example.com',
      applicantName: 'Spoofed Name',
      propertyTitle: 'Spoofed Property',
    })
    expect(res.status).toBe(400)
    expect(mail.sendApplicationReceived).not.toHaveBeenCalled()
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('FROM applications'))).toBe(false)
  })

  it('sends once from the database and does not send again', async () => {
    const first = await post({ referenceCode: REF })
    expect(first.status).toBe(202)
    expect(mail.sendApplicationReceived).toHaveBeenCalledTimes(1)
    expect(mail.sendApplicationReceived).toHaveBeenCalledWith({
      email: 'db-applicant@example.com',
      applicantName: 'Db Applicant',
      propertyTitle: 'Db Property',
      referenceCode: REF,
    })

    const second = await post({ referenceCode: REF })
    expect(second.status).toBe(202)
    expect(mail.sendApplicationReceived).toHaveBeenCalledTimes(1)
  })
})
