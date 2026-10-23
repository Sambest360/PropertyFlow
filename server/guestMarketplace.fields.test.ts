import { describe, expect, it } from 'vitest'
import { filterBootstrapForGuest } from './guestMarketplace.js'

// Angela's guest-path audit: bootstrap.ts:315 selects users.email/phone/metadata and
// bootstrap.ts:301 clients.settings. None of it may reach the signed-out slice.
const FORBIDDEN = new Set([
  'email', 'phone', 'metadata', 'settings', 'password_hash', 'auth_user_id', 'idNumberOrPassport',
  'verification', 'signature', 'landlordId_raw', 'serialNumber', 'internalAssetsRaw', 'notes',
  'tenantEmail', 'applicantEmail', 'contactPhone', 'enabledPermissions_secret',
])

function walk(v: unknown, path: string, hits: string[]) {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, hits))
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (FORBIDDEN.has(k)) hits.push(`${path}.${k}`)
      walk(x, `${path}.${k}`, hits)
    }
}

const raw = {
  agencies: [
    { id: 'ag-1', name: 'A', slug: 'a', city: 'CT', status: 'active', createdAt: '2026-01-01',
      enabledPermissions: ['x'], settings: { listingLimits: { max: 3 }, secret: 'S' } },
  ],
  users: [
    { id: 'll-1', name: 'Lan Lord', email: 'l@example.test', phone: '+0', role: 'landlord',
      idNumberOrPassport: 'X', verification: { status: 'verified', profile: { idNumberOrPassport: 'X' } },
      signature: 'sig', metadata: { a: 1 } },
    { id: 'ag-u', name: 'Agent Name', email: 'a@example.test', phone: '+1', role: 'ground_agent' },
  ],
  buildings: [{ id: 'b-1', clientId: 'ag-1', landlordId: 'll-1', name: 'B', images: ['i1', 'i2'] }],
  units: [{ id: 'unt-1', buildingId: 'b-1', agentId: 'ag-u', statusKey: 'PUBLISHED', listingType: 'rent', images: ['u1', 'u2'] }],
  properties: [
    { id: 'P-1', agencyId: 'ag-1', landlordId: 'll-1', agentId: 'ag-u', buildingId: 'b-1', unitId: 'unt-1',
      status: 'Published', deletedAt: null, images: ['p1', 'p2'],
      internalAssets: [{ id: 'ia', serialNumber: 'SN' }] },
  ],
  viewingSlots: [], leads: [{ email: 'lead@example.test', phone: '+2', notes: 'n' }],
  applications: [{ applicantEmail: 'x@example.test' }], tenancies: [{ tenantEmail: 't@example.test' }],
  messages: [{ body: 'm' }], lookups: [],
}

describe('guest marketplace: no contact / profile / settings fields (bootstrap.ts:301,315)', () => {
  for (const listingId of [undefined, 'P-1']) {
    it(`list${listingId ? ' ?id=' : ''}: no forbidden key at any depth`, () => {
      const out = filterBootstrapForGuest(raw, listingId ? { listingId } : {})
      const hits: string[] = []
      walk(out, '$', hits)
      expect(hits).toEqual([])
      expect(out.users).toEqual([])
      expect((out.properties as unknown[]).length).toBe(1)
      const p = (out.properties as Array<Record<string, unknown>>)[0]
      expect(p.landlordId).toBe('')
      expect(p.agentId).toBeNull()
      expect(p.agentName).toBe('Agent Name')
      expect(p.internalAssets).toEqual([])
      expect((out.buildings as Array<Record<string, unknown>>)[0].landlordId).toBeNull()
      expect((out.units as Array<Record<string, unknown>>)[0].agentId).toBeNull()
      expect(Object.keys((out.agencies as Array<Record<string, unknown>>)[0]).sort()).toEqual(
        ['city', 'createdAt', 'enabledPermissions', 'id', 'name', 'slug', 'status'])
      const s = JSON.stringify(out)
      expect(s).not.toMatch(/example\.test|\+[0-9]/)
    })
  }
})
