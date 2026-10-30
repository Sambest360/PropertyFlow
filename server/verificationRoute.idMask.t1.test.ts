import { afterAll, describe, expect, it, vi } from 'vitest'

/**
 * T1 ruling (a), Jim C5: PATCH /api/admin/users/:userId/verification answers
 * the reviewing super admin with the subject's ID masked, on the user and on
 * the verification profile. Real Hono app (server/index.ts) and real route
 * handler; only the session lookup, the stored user update, the decision
 * email and Postgres are stubbed.
 */
vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
})

const FULL = '7505055009081'
const SUBJECT = {
  id: 'b9000001-0001-4000-8000-000000000077',
  frontendId: 'u-ll-77',
  email: 'll@example.com',
  name: 'Lerato Landlord',
  role: 'landlord',
  agencyId: null,
  phone: '0820000000',
  active: true,
  company: 'LL Pty',
  idNumberOrPassport: FULL,
  verification: {
    status: 'approved',
    reviewedAt: '2026-10-30T12:00:00Z',
    profile: { company: 'LL Pty', idNumberOrPassport: FULL },
    documents: [],
  },
}

vi.mock('./auth.js', async (orig) => ({
  ...(await orig<typeof import('./auth.js')>()),
  resolveSessionUser: vi.fn(async () => ({
    id: 'b9000001-0001-4000-8000-000000000001',
    frontendId: 'u-super',
    email: 'sa@example.com',
    name: 'Platform',
    role: 'super_admin',
    agencyId: null,
    active: true,
  })),
  updateUserVerification: vi.fn(async () => SUBJECT),
}))

vi.mock('./mailtrap.js', async (orig) => ({
  ...(await orig<typeof import('./mailtrap.js')>()),
  sendVerificationDecision: vi.fn(async () => undefined),
}))

vi.mock('./db.js', async (orig) => ({
  ...(await orig<typeof import('./db.js')>()),
  databaseConfigured: true,
  query: vi.fn(async () => []),
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}))

const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => quiet.mockRestore())

describe('PATCH /api/admin/users/:userId/verification response (T1 ruling (a))', () => {
  it('pin (C5): the reviewing super admin gets the subject ID masked on the user and the verification profile', async () => {
    const { default: app } = await import('./index.js')
    const { maskIdNumber } = await import('../src/lib/screening/consentTerms.js')
    const res = await app.fetch(
      new Request(`http://propertyflow.test/api/admin/users/${SUBJECT.frontendId}/verification`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      }),
    )
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(FULL)
    const body = JSON.parse(text) as {
      ok: boolean
      user: { id: string; idNumberOrPassport?: string; verification?: { status?: string; profile?: Record<string, unknown> } }
    }
    expect(body.ok).toBe(true)
    expect(body.user.id).toBe(SUBJECT.frontendId)
    expect(body.user.idNumberOrPassport).toBe(maskIdNumber(FULL))
    expect(body.user.verification?.status).toBe('approved')
    expect(body.user.verification?.profile).toEqual({ company: 'LL Pty', idNumberOrPassport: maskIdNumber(FULL) })
  })
})
