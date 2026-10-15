import { describe, expect, it } from 'vitest'
import { buildListingSummaryBlock } from './listingDescriptionDraft'

describe('buildListingSummaryBlock', () => {
  it('includes beds, rent, suburb, and amenity bullets', () => {
    const block = buildListingSummaryBlock({
      propertyType: 'Apartment',
      listingMode: 'rent',
      suburb: 'Pinelands',
      city: 'Cape Town',
      beds: 2,
      baths: 1,
      parking: 1,
      rent: 8990,
      amenities: ['Fibre', 'Parking', 'Unfurnished'],
      title: '2 bed flat',
    })
    expect(block).toContain('2 bedrooms')
    expect(block).toContain('Pinelands')
    expect(block).toContain('Monthly rental:')
    expect(block).toMatch(/R\s*8[\s\u00a0]?990/)
    expect(block).toContain('• Fibre')
    expect(block).toContain('2 bed flat')
  })

  it('uses open-plan wording for 0 beds unfurnished', () => {
    const block = buildListingSummaryBlock({
      propertyType: 'Apartment',
      listingMode: 'rent',
      suburb: 'Central',
      city: 'Gqeberha',
      beds: 0,
      baths: 1,
      parking: 0,
      amenities: ['Unfurnished'],
      unfurnished: true,
    })
    expect(block).toContain('unfurnished open-plan')
    expect(block).not.toContain('0 bedroom')
  })
})
