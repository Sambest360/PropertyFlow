import { describe, expect, it } from 'vitest'
import { filterBootstrapForGuest } from './guestMarketplace.js'

// CHARACTERIZATION TESTS (ported from #112 ef87c536, round 4): they pin what
// filterBootstrapForGuest does today on a hand-built bootstrap, so a change to the
// guest slice shows up here. They do not prove the live bootstrap's shape.
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

describe('guest slice: location privacy', () => {
  const located = {
    agencies: [{ id: 'ag-1', name: 'A', slug: 'a', city: 'CT', status: 'active', createdAt: '2026-01-01' }],
    users: [],
    buildings: [
      {
        id: 'b-1', clientId: 'ag-1', landlordId: null, name: 'B',
        addressLine1: '26 Buckland Ave', formattedAddress: '26 Buckland Ave, Richmond Hill, Gqeberha',
        placeId: 'ChIJsecret', suburb: 'Richmond Hill', city: 'Gqeberha', lat: -33.958123, lng: 25.611987,
      },
    ],
    units: [
      {
        id: 'unt-1', buildingId: 'b-1', statusKey: 'PUBLISHED', listingType: 'rent', unitNumber: '7',
        formattedAddress: '7, 26 Buckland Ave', placeId: 'ChIJsecret', lat: -33.958123, lng: 25.611987,
      },
    ],
    properties: [
      {
        id: 'P-1', agencyId: 'ag-1', landlordId: '', agentId: null, buildingId: 'b-1', unitId: 'unt-1',
        status: 'Published', deletedAt: null, address: '26 Buckland Ave, 7',
        formattedAddress: '7, 26 Buckland Ave, Richmond Hill', placeId: 'ChIJsecret',
        suburb: 'Richmond Hill', city: 'Gqeberha', lat: -33.958123, lng: 25.611987,
      },
    ],
    viewingSlots: [],
  }

  it('never sends a street address, unit number or place id to guests', () => {
    for (const listingId of [undefined, 'P-1']) {
      const out = filterBootstrapForGuest(located, { listingId })
      const json = JSON.stringify(out)
      expect(json).not.toMatch(/Buckland|ChIJsecret/)
      const prop = (out.properties as Array<Record<string, unknown>>)[0]
      expect(prop.address).toBe('Richmond Hill, Gqeberha')
      expect((out.units as Array<Record<string, unknown>>)[0].unitNumber).toBe('')
    }
  })

  it('rounds coordinates to about 1 km', () => {
    const out = filterBootstrapForGuest(located)
    for (const key of ['properties', 'units', 'buildings'] as const) {
      const row = (out[key] as Array<Record<string, unknown>>)[0]
      expect(row.lat).toBe(-33.96)
      expect(row.lng).toBe(25.61)
    }
  })
})

describe('T2 (spec r4, C7): erf size reaches the public card', () => {
  it('PUBLIC_UNIT_KEYS carries erf_size_sqm next to square_meters', async () => {
    const { PUBLIC_UNIT_KEYS } = await import('./publicMarketplaceKeys.js')
    expect(PUBLIC_UNIT_KEYS).toContain('erf_size_sqm')
    expect(PUBLIC_UNIT_KEYS).toContain('square_meters')
  })

  it('the guest slice keeps erfSizeSqm and area as separate fields', () => {
    const withSizes = {
      ...raw,
      properties: raw.properties.map((p) => ({ ...p, area: 250, erfSizeSqm: 600, type: 'Industrial' })),
      units: raw.units.map((u) => ({ ...u, squareMeters: 250, erfSizeSqm: 600 })),
    }
    const out = filterBootstrapForGuest(withSizes, {})
    const p = (out.properties as Array<Record<string, unknown>>)[0]
    expect(p.area).toBe(250)
    expect(p.erfSizeSqm).toBe(600)
    expect(p.type).toBe('Industrial')
    expect((out.units as Array<Record<string, unknown>>)[0].erfSizeSqm).toBe(600)
  })
})
