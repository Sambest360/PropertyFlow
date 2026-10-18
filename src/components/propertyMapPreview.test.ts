import { describe, expect, it } from 'vitest'
import { formatZAR } from '../data/seed'
import { resolveMapPreviewFields } from './propertyMapPreview'
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
