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
