import { describe, expect, it, vi } from 'vitest'

vi.mock('./db.js', () => ({ databaseConfigured: true, query: vi.fn(async () => []), withTransaction: vi.fn(), clientQuery: vi.fn() }))

describe('CR10 B2b: staff cannot swap lease parties once an envelope exists', () => {
  it('changing tenant_id or landlord_id on an enveloped lease is 403 LEASE_PARTY_LOCKED', async () => {
    const { assertLeasePartiesUnchanged } = await import('./writes.js')
    const locked = { tenant_id: 'uuid-t', landlord_id: 'uuid-ll', envelope_id: 'ENV-1' }
    expect(() => assertLeasePartiesUnchanged(locked, 'uuid-staff', 'uuid-ll')).toThrow(expect.objectContaining({ status: 403, code: 'LEASE_PARTY_LOCKED' }))
    expect(() => assertLeasePartiesUnchanged(locked, 'uuid-t', 'uuid-staff')).toThrow(expect.objectContaining({ code: 'LEASE_PARTY_LOCKED' }))
    expect(() => assertLeasePartiesUnchanged(locked, 'uuid-t', 'uuid-ll')).not.toThrow()
    expect(() => assertLeasePartiesUnchanged({ ...locked, envelope_id: null }, 'uuid-staff', null)).not.toThrow()
    expect(() => assertLeasePartiesUnchanged(undefined, 'uuid-x', null)).not.toThrow()
  })
})

describe('CR10 nit 3: the party-lock read in upsertTenancy is FOR UPDATE', () => {
  it('locks the lease row (inside the gatedPersist tenancy transaction)', async () => {
    const src = (await import('node:fs')).readFileSync('server/writes.ts', 'utf8')
    expect(src).toMatch(/AS envelope_id\s+FROM leases WHERE id = \$1::uuid FOR UPDATE/)
    const idx = (await import('node:fs')).readFileSync('server/index.ts', 'utf8')
    expect(idx).toMatch(/body\.resource === 'tenancy' && body\.action === 'upsert'[\s\S]{0,200}withTransaction/)
  })
})
