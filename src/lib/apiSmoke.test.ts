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

  it('returns seeded agencies in inventory counts', async () => {
    const res = await fetch(`${base}/api/counts`)
    const body = (await res.json()) as Record<string, string>
    expect(Number(body.clients)).toBeGreaterThanOrEqual(1)
  })

  it(
    'bootstraps agencies, users, and properties for the workspace',
    async () => {
      const res = await fetch(`${base}/api/bootstrap`)
      const body = (await res.json()) as {
        agencies?: unknown[]
        properties?: unknown[]
        users?: unknown[]
        error?: string
      }
      expect(body.error).toBeUndefined()
      expect((body.agencies ?? []).length).toBeGreaterThanOrEqual(1)
      expect((body.properties ?? []).length).toBeGreaterThanOrEqual(1)
      expect((body.users ?? []).length).toBeGreaterThanOrEqual(1)
    },
    slow,
  )

  it(
    'lets an agency admin save a lead in their agency',
    async () => {
      const id = `LD-vitest-${Date.now()}`
      const res = await fetch(`${base}/api/persist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': 'u-amelia',
          'X-Role': 'client_admin',
          'X-Agency-Id': 'ag-horizon',
        },
        body: JSON.stringify({
          resource: 'lead',
          action: 'upsert',
          id,
          data: {
            id,
            agencyId: 'ag-horizon',
            propertyId: 'PR-1002',
            name: 'Vitest Smoke',
            email: 'vitest-smoke@test.com',
            stage: 'New',
            type: 'Rent',
            value: 0,
            agentId: 'u-james',
          },
        }),
      })
      const body = (await res.json()) as { ok?: boolean; error?: string; message?: string }
      expect(body.ok).toBe(true)
    },
    slow,
  )

  it(
    'rejects a lead saved into another agency',
    async () => {
      const id = `LD-vitest-xagency-${Date.now()}`
      const res = await fetch(`${base}/api/persist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': 'u-amelia',
          'X-Role': 'client_admin',
          'X-Agency-Id': 'ag-horizon',
        },
        body: JSON.stringify({
          resource: 'lead',
          action: 'upsert',
          id,
          data: {
            id,
            agencyId: 'ag-other',
            propertyId: 'PR-9999',
            name: 'Cross Agency',
            email: 'xagency@test.com',
            stage: 'New',
            type: 'Rent',
            value: 0,
            agentId: 'u-james',
          },
        }),
      })
      const body = (await res.json()) as { ok?: boolean; error?: string; message?: string }
      expect(body.ok).not.toBe(true)
      expect(`${body.message ?? ''} ${body.error ?? ''} ${res.status}`).toMatch(
        /forbid|403|scope|agency/i,
      )
    },
    slow,
  )

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