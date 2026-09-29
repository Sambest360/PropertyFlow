/**
 * Live API smoke against DATABASE_URL (Supabase or local).
 * Skips when PF_API_SMOKE is not "1" so CI without secrets still passes.
 *
 * Integration naming: business outcomes only (no HTTP verbs / status codes).
 */
import { describe, expect, it } from 'vitest'

const run = process.env.PF_API_SMOKE === '1'
const base = process.env.PF_API_BASE || 'http://127.0.0.1:8787'

const slow = 30_000

describe.skipIf(!run)('Live API against the configured database', () => {
  it('reports the database as available', async () => {
    const res = await fetch(`${base}/api/health`)
    const body = (await res.json()) as { ok: boolean; database: string }
    expect(body.ok).toBe(true)
    expect(body.database).toBe('up')
  })

  it('does not publish inventory counts anonymously', async () => {
    const res = await fetch(`${base}/api/counts`)
    expect(res.status).toBe(401)
  })

  it(
    'does not hand the full workspace to an anonymous caller',
    async () => {
      const res = await fetch(`${base}/api/bootstrap`)
      expect(res.status).toBe(401)
    },
    slow,
  )

  it('rejects writes that only present actor headers', async () => {
    const res = await fetch(`${base}/api/persist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'u-amelia',
        'X-Role': 'super_admin',
        'X-Agency-Id': 'ag-horizon',
      },
      body: JSON.stringify({
        resource: 'lead',
        action: 'upsert',
        id: 'LD-header-only',
        data: { id: 'LD-header-only', agencyId: 'ag-horizon', name: 'Forged' },
      }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects writes without actor identity', async () => {
    const res = await fetch(`${base}/api/persist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resource: 'lead',
        action: 'upsert',
        id: 'LD-no-actor',
        data: { id: 'LD-no-actor', agencyId: 'ag-horizon' },
      }),
    })
    const body = (await res.json()) as { error?: string; message?: string }
    expect(`${body.message ?? ''} ${body.error ?? ''}`).toMatch(/actor|required/i)
    expect(res.status).toBe(401)
  })
})