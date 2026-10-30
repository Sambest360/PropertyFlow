import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PayFast checkout host. PayFast's developer docs give the live payment
 * post URL as https://www.payfast.co.za/eng/process and the sandbox as
 * https://sandbox.payfast.co.za/eng/process. These tests pin both, through
 * the constant and through the real create route, and guard against the
 * old host coming back into server/ or src/.
 *
 * No network: the DB and id-map edges are mocked; nothing calls PayFast.
 */
const PAYMENT_UUID = '33333333-3333-4333-8333-333333333333'

vi.mock('./db.js', () => ({
  query: async (text: string) => {
    if (text.includes('FROM payments')) {
      return [
        {
          id: PAYMENT_UUID,
          amount: '1850.00',
          status: 'DUE',
          payment_type: 'Rent',
          party_name: 'Thandiwe Mokoena',
          party_user_id: null,
          client_id: null,
          unit_id: null,
        },
      ]
    }
    return []
  },
  withTransaction: async () => {
    throw new Error('not used')
  },
}))

vi.mock('./entityMap.js', () => ({
  resolveUuid: vi.fn(async () => PAYMENT_UUID),
}))

const { payfastCreate } = await import('./payfastRoutes.js')
const { PAYFAST_LIVE_PROCESS_URL, PAYFAST_PROCESS_URL } = await import('./payfast.js')

const ENV_KEYS = ['PAYFAST_MERCHANT_ID', 'PAYFAST_MERCHANT_KEY', 'PAYFAST_PASSPHRASE', 'PAYFAST_MODE', 'PAYFAST_PUBLIC_URL'] as const
let saved: Record<string, string | undefined> = {}

function app() {
  const a = new Hono()
  a.post('/api/payfast/create', (c) => payfastCreate(c))
  return a
}

async function createCheckout(): Promise<{ ok: boolean; processUrl?: string }> {
  const res = await app().request('https://pf.test/api/payfast/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paymentId: 'PAY-1' }),
  })
  expect(res.status).toBe(200)
  return (await res.json()) as { ok: boolean; processUrl?: string }
}

describe('PayFast checkout host', () => {
  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
    for (const k of ENV_KEYS) delete process.env[k]
    // Test-only dummy merchant values, not real credentials.
    process.env.PAYFAST_MERCHANT_ID = 'test-merchant'
    process.env.PAYFAST_MERCHANT_KEY = 'test-key'
    process.env.PAYFAST_PUBLIC_URL = 'https://pf.test'
  })
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('live constant is the documented live host', () => {
    expect(PAYFAST_LIVE_PROCESS_URL).toBe('https://www.payfast.co.za/eng/process')
  })

  it('sandbox constant stays the documented sandbox host', () => {
    expect(PAYFAST_PROCESS_URL).toBe('https://sandbox.payfast.co.za/eng/process')
  })

  it('create route with PAYFAST_MODE=live returns the live host exactly', async () => {
    process.env.PAYFAST_MODE = 'live'
    const body = await createCheckout()
    expect(body.ok).toBe(true)
    expect(body.processUrl).toBe('https://www.payfast.co.za/eng/process')
  })

  it('create route by default (no PAYFAST_MODE) returns the sandbox host', async () => {
    const body = await createCheckout()
    expect(body.ok).toBe(true)
    expect(body.processUrl).toBe('https://sandbox.payfast.co.za/eng/process')
  })

  it('the old checkout host appears in no server/ or src/ file', () => {
    // Built in two parts so this file does not match itself.
    const needle = 'payfast' + '.io'
    const root = join(__dirname, '..')
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        const p = join(dir, name)
        const st = statSync(p)
        if (st.isDirectory()) walk(p)
        else if (/\.(ts|tsx|js|jsx|mjs|cjs|json|html|css)$/.test(name)) {
          const lines = readFileSync(p, 'utf8').split('\n')
          lines.forEach((line, i) => {
            if (line.toLowerCase().includes(needle)) hits.push(`${relative(root, p)}:${i + 1}`)
          })
        }
      }
    }
    walk(join(root, 'server'))
    walk(join(root, 'src'))
    expect(hits).toEqual([])
  })
})
