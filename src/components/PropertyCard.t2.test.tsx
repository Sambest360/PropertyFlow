import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { PropertyAsset } from '../types/domain'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'guest' }, isAuthenticated: false }),
}))
vi.mock('../context/AppStore', () => ({ useStore: () => ({ state: { reviews: [] } }) }))
vi.mock('../hooks/useWishlist', () => ({ useWishlist: () => ({ saved: () => false, toggle: () => undefined }) }))

import { PropertyCard } from './PropertyCard'

const base = {
  id: 'unt-card',
  agencyId: 'ag-1',
  landlordId: '',
  agentId: null,
  buildingId: 'b-1',
  unitId: 'unt-card',
  title: 'Listing',
  type: 'Apartment',
  status: 'Published',
  listingMode: 'rent',
  price: null,
  rent: 6500,
  beds: 2,
  baths: 1,
  parking: 1,
  area: 0,
  city: 'Gqeberha',
  suburb: 'Walmer',
  address: '1 Main Rd',
  lat: 0,
  lng: 0,
  images: [],
  rooms: [],
  amenities: [],
  description: '',
  featured: false,
} as unknown as PropertyAsset

const html = (over: Partial<PropertyAsset>) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <PropertyCard property={{ ...base, ...over } as PropertyAsset} />
    </MemoryRouter>,
  )
const text = (over: Partial<PropertyAsset>) => html(over).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('T2 card (spec r4): type, sizes, Bachelor/Studio', () => {
  it('shows Industrial on the card', () => {
    expect(text({ type: 'Industrial', beds: 0, area: 1200 })).toContain('Industrial')
  })
  it('floor 250 shows 250 m² and erf 600 shows separately', () => {
    const t = text({ type: 'House', area: 250, erfSizeSqm: 600 })
    expect(t).toContain('250 m²')
    expect(t).toContain('Erf 600 m²')
    expect(t).not.toContain('850')
  })
  it('a 0-bed residential Apartment shows Bachelor/Studio', () => {
    expect(text({ type: 'Apartment', beds: 0, area: 32 })).toContain('Bachelor/Studio')
  })
  it('a 0-bed Office shows no bed fact and no Bachelor/Studio', () => {
    const t = text({ type: 'Office', beds: 0, area: 90 })
    expect(t).not.toContain('Bachelor/Studio')
    expect(t).not.toMatch(/\d+ bed\b/)
  })
  it('shows a stored type chip, but none for a legacy row whose type is only a bedroom guess', () => {
    expect(html({ type: 'Office', beds: 0, area: 90 })).toMatch(/>Office</)
    expect(html({ type: 'Office', beds: 0, area: 90, typeInferred: true })).not.toMatch(/>Office</)
  })
  it('hides a size that is not set (no "0 m²")', () => {
    const t = text({ type: 'Apartment', area: 0, erfSizeSqm: null })
    expect(t).not.toContain('0 m²')
    expect(t).not.toContain('Erf')
  })
})
