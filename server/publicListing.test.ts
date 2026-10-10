import { describe, expect, it } from 'vitest'
import { publicListingById, type PublicListingDeps } from './publicListing'

// A fake table of 700 listings, newest first; the one we want sits at row 600.
const db = Array.from({ length: 700 }, (_, i) => ({
  unitUuid: `uuid-${i}`,
  propertyId: `p-${i}`,
  status: i === 650 ? 'Draft' : 'Published',
}))

function deps(): PublicListingDeps & { built: string[][] } {
  const built: string[][] = []
  return {
    built,
    resolveUnitId: async (id) => db.find((r) => r.propertyId === id)?.unitUuid ?? null,
    build: async (unitIds) => {
      built.push(unitIds)
      const rowsFor = db.filter((r) => unitIds.includes(r.unitUuid))
      return {
        users: [{ id: 'u-ll', role: 'landlord', verification: { status: 'approved' } }, { id: 'u-ag', name: 'Agent' }],
        units: [],
        buildings: [],
        agencies: [],
        properties: rowsFor.map((r) => ({
          id: r.propertyId,
          status: r.status,
          landlordId: 'u-ll',
          agentId: 'u-ag',
          images: ['a', 'b', 'c'],
        })),
      }
    },
  }
}

describe('GET /api/public/marketplace?id= handler (P3a)', () => {
  it('finds a listing past row 500 by id, with all photos and ids hidden', async () => {
    const d = deps()
    const out = await publicListingById('p-600', d)
    expect(out.status).toBe(200)
    expect(d.built).toEqual([['uuid-600']])
    const props = out.body.properties as Array<Record<string, unknown>>
    expect(props).toHaveLength(1)
    expect(props[0].images).toEqual(['a', 'b', 'c'])
    expect(props[0].landlordId).toBe('')
    expect(props[0].agentId).toBeNull()
  })
  it('404 for an unlisted listing', async () => {
    const out = await publicListingById('p-650', deps())
    expect(out.status).toBe(404)
    expect(out.body.error).toBe('listing_not_found')
  })
  it('404 for an unknown id, a resolver error, or a blank id', async () => {
    expect((await publicListingById('p-nope', deps())).status).toBe(404)
    const failing = { ...deps(), resolveUnitId: async () => Promise.reject(new Error('boom')) }
    expect((await publicListingById('p-1', failing)).status).toBe(404)
    expect((await publicListingById('  ', deps())).status).toBe(404)
  })
})
