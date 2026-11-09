import { beforeEach, describe, expect, it, vi } from 'vitest'

/** B1 u1: the server readiness check (title, photo, address, price). */
let stored: Record<string, unknown> | null = null
vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(async () => (stored ? [stored] : [])),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
}))

const { listingNotReadyReason, assertListingReadyToPublish } = await import('./listingReadiness.js')
const U = '0f000000-0000-4000-8000-000000000001'
const ready = { title: 'Flat', images: ['/api/files/a.jpg'], formatted_address: '1 Main Rd', rent: '8500', price: null, b_address: null, b_suburb: null }
const reason = (over: Record<string, unknown>, pending?: Parameters<typeof listingNotReadyReason>[1]) => {
  stored = { ...ready, ...over }
  return listingNotReadyReason(U, pending)
}

beforeEach(() => {
  stored = null
})

describe('listingNotReadyReason (B1 u1)', () => {
  it('names the first missing thing, in order', async () => {
    expect(await reason({ title: '  ' })).toBe('Add a listing title before publishing.')
    expect(await reason({ images: [] })).toBe('Add at least one listing photo before publishing.')
    expect(await reason({ formatted_address: null, b_address: ' ', b_suburb: '' })).toBe('Add a street address or suburb before publishing.')
    expect(await reason({ rent: null, price: null })).toBe('Add a rent or sale price before publishing.')
    expect(await reason({ rent: '0', price: '0' })).toBe('Add a rent or sale price before publishing.')
  })
  it('a sale price alone, a rent alone, or everything present is ready', async () => {
    expect(await reason({ rent: '0', price: '1500000' })).toBeNull()
    expect(await reason({ rent: '8500', price: null })).toBeNull()
    expect(await reason({})).toBeNull()
    expect(await reason({ formatted_address: null, b_address: null, b_suburb: 'Summerstrand' })).toBeNull()
  })
  it('values in the save in progress win over the stored ones', async () => {
    expect(await reason({ rent: null, price: null }, { rent: 8500 })).toBeNull()
    expect(await reason({ images: [] }, { images: ['x'] })).toBeNull()
  })
  it('a missing unit is not this check\'s business (null); the assert throws 422 LISTING_NOT_READY', async () => {
    stored = null
    expect(await listingNotReadyReason(U)).toBeNull()
    stored = { ...ready, images: [] }
    await expect(assertListingReadyToPublish(U)).rejects.toMatchObject({ status: 422, code: 'LISTING_NOT_READY' })
  })
})
