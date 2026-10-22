import { describe, expect, it } from 'vitest'
import { formatZAR } from '../data/seed'
import {
  formatMapPinLabel,
  resolveCardForProperty,
  resolveMapPreviewFields,
} from './propertyMapPreview'
import type { PropertyAsset } from '../types/domain'
import type { UnitCardPayload } from '../lib/api/unitsApi'

const baseProperty: PropertyAsset = {
  id: 'p-1',
  title: '2-Bedroom, 2-Bathroom',
  beds: 1,
  baths: 2,
  parking: 1,
  area: 85,
  suburb: 'Sea Point',
  city: 'Cape Town',
  listingMode: 'rent',
  rent: 14_500,
  price: null,
  images: ['https://example.com/a.jpg'],
  lat: -33.9,
  lng: 18.4,
} as PropertyAsset

const baseCard = {
  id: 'unt-abc123',
  property_id: 'unt-abc123',
  title: 'Ss Bella Mare — 2 bed rental',
  bedrooms: 2,
  bathrooms: 2,
  parking: 1,
  square_meters: 92,
  primary_image: 'https://example.com/card.jpg',
  display_metadata: { primary_amount_label: 'R 14 500 / month' },
  building: { suburb: 'Green Point', city: 'Cape Town' },
} as UnitCardPayload

describe('resolveMapPreviewFields', () => {
  it('prefers unit card title and bedroom count over property fields', () => {
    const fields = resolveMapPreviewFields(baseProperty, 'rent', baseCard)
    expect(fields.title).toBe('Ss Bella Mare — 2 bed rental')
    expect(fields.beds).toBe(2)
    expect(fields.image).toBe('https://example.com/card.jpg')
    expect(fields.priceLabel).toBe('R 14 500 / month')
    expect(fields.suburb).toBe('Green Point')
  })

  it('falls back to property when card is omitted', () => {
    const fields = resolveMapPreviewFields(baseProperty, 'rent')
    expect(fields.title).toBe('2-Bedroom, 2-Bathroom')
    expect(fields.beds).toBe(1)
    expect(fields.priceLabel).toBe(`${formatZAR(14_500)} / month`)
  })
})

describe('resolveCardForProperty', () => {
  it('finds card when map is keyed by unit id alias', () => {
    const card = { ...baseCard, id: 'unt-PR-imuc3d', property_id: 'PR-imuc3d' }
    const aliasProperty = { ...baseProperty, id: 'PR-imuc3d' }
    const cards = { 'unt-PR-imuc3d': card }
    expect(resolveCardForProperty(aliasProperty, cards)?.bedrooms).toBe(2)
  })
})

describe('formatMapPinLabel', () => {
  it('matches card amount without rounding 14500 up to 15k', () => {
    expect(formatMapPinLabel(baseProperty, 'rent', baseCard)).toBe('R14.5k/mo')
    expect(formatMapPinLabel(baseProperty, 'rent')).toBe('R14.5k/mo')
  })
})
