import { describe, expect, it } from 'vitest'
import {
  ERF_SIZE_HINT,
  ERF_SIZE_LABEL,
  bedsLabel,
  effectiveFloorSizeSqm,
  isResidentialType,
  listingDetailFacts,
  listingSizeFacts,
  parseSizeSqm,
  titleTypeWarning,
} from './listingSizes'

describe('T2 erf field copy (spec r4, Oscar/Michael ruling)', () => {
  it('is labelled in m² with the hectare hint and the sectional-title blank', () => {
    expect(ERF_SIZE_LABEL).toBe('Erf / stand size (m²)')
    expect(ERF_SIZE_HINT).toContain('1 ha = 10 000 m²')
    expect(ERF_SIZE_HINT.toLowerCase()).toContain('sectional-title')
  })
})

describe('parseSizeSqm', () => {
  it('blank is null (optional), numbers ≥ 0 pass, junk and negatives are invalid', () => {
    expect(parseSizeSqm('')).toBeNull()
    expect(parseSizeSqm('  ')).toBeNull()
    expect(parseSizeSqm(null)).toBeNull()
    expect(parseSizeSqm(undefined)).toBeNull()
    expect(parseSizeSqm('600')).toBe(600)
    expect(parseSizeSqm('0')).toBe(0)
    expect(parseSizeSqm(250.5)).toBe(250.5)
    expect(parseSizeSqm('-1')).toBe('invalid')
    expect(parseSizeSqm('abc')).toBe('invalid')
  })
})

describe('effectiveFloorSizeSqm: an explicit floor size wins over the room sum', () => {
  const rooms = [{ areaSqm: '20' }, { areaSqm: '15' }, { areaSqm: '' }]
  it('uses the explicit entry when set', () => {
    expect(effectiveFloorSizeSqm('250', rooms)).toBe(250)
  })
  it('falls back to the room sum when blank', () => {
    expect(effectiveFloorSizeSqm('', rooms)).toBe(35)
    expect(effectiveFloorSizeSqm(undefined, [])).toBe(0)
  })
})

describe('Bachelor/Studio only for a residential type with 0 bedrooms', () => {
  it('knows residential types', () => {
    for (const t of ['Apartment', 'House', 'Townhouse', 'apartment', 'Flat']) expect(isResidentialType(t)).toBe(true)
    for (const t of ['Office', 'Commercial', 'Industrial', 'Farm', 'Vacant Land', 'Student Accommodation', '']) {
      expect(isResidentialType(t)).toBe(false)
    }
  })
  it('labels beds', () => {
    expect(bedsLabel('Apartment', 0)).toBe('Bachelor/Studio')
    expect(bedsLabel('House', 0)).toBe('Bachelor/Studio')
    expect(bedsLabel('Apartment', 2)).toBe('2 bed')
    expect(bedsLabel('Office', 0)).toBeNull()
    expect(bedsLabel('Industrial', 0)).toBeNull()
    expect(bedsLabel('Office', 3)).toBe('3 bed')
  })
})

describe('listingSizeFacts: floor and erf shown separately, never summed', () => {
  it('floor 250 and erf 600 show as two facts', () => {
    const f = listingSizeFacts({ floorSqm: 250, erfSqm: 600 })
    expect(f.floor).toBe('250 m²')
    expect(f.erf).toBe('Erf 600 m²')
    expect(JSON.stringify(f)).not.toContain('850')
  })
  it('hides a size that is not set', () => {
    expect(listingSizeFacts({ floorSqm: 0, erfSqm: null })).toEqual({ floor: null, erf: null })
    expect(listingSizeFacts({ floorSqm: 80, erfSqm: undefined })).toEqual({ floor: '80 m²', erf: null })
  })
  it('groups thousands with a space (SA style)', () => {
    expect(listingSizeFacts({ floorSqm: 1250, erfSqm: 10000 }).erf?.replace(/\s/g, ' ')).toBe('Erf 10 000 m²')
  })
})

describe('title vs type warns, never blocks', () => {
  it('warns for a House or Industrial title on an Apartment', () => {
    expect(titleTypeWarning('Family house in Walmer', 'Apartment')).toMatch(/house/i)
    expect(titleTypeWarning('Industrial unit, Struandale', 'Apartment')).toMatch(/industrial/i)
  })
  it('says nothing when title and type agree or no type is chosen', () => {
    expect(titleTypeWarning('Sunny apartment', 'Apartment')).toBeNull()
    expect(titleTypeWarning('Family house', 'House')).toBeNull()
    expect(titleTypeWarning('Neat townhouse', 'Townhouse')).toBeNull()
    expect(titleTypeWarning('Warehouse, Struandale', 'Industrial')).toBeNull()
    expect(titleTypeWarning('Family house', '')).toBeNull()
  })
})

describe('listing detail facts (T2 detail view)', () => {
  const p = { type: 'House', beds: 3, baths: 2, parking: 1, area: 250, erfSizeSqm: 600, rooms: [{}, {}] }
  it('lists floor and erf separately in the summary line', () => {
    const f = listingDetailFacts(p)
    expect(f.summary).toEqual(['3 bedrooms', '2 bathrooms', '1 parking', '250 m² floor', 'Erf 600 m²', '2 configured rooms'])
    expect(f.bedroomsValue).toBe(3)
  })
  it('a 0-bed Apartment says Bachelor/Studio in the summary and the Bedrooms stat', () => {
    const f = listingDetailFacts({ ...p, type: 'Apartment', beds: 0, area: 32, erfSizeSqm: null })
    expect(f.summary[0]).toBe('Bachelor/Studio')
    expect(f.summary).not.toContain('Erf')
    expect(f.summary).toContain('32 m² floor')
    expect(f.bedroomsValue).toBe('Bachelor/Studio')
  })
  it('a 0-bed Office keeps the dash and drops an unset floor size', () => {
    const f = listingDetailFacts({ ...p, type: 'Office', beds: 0, area: 0, erfSizeSqm: undefined })
    expect(f.bedroomsValue).toBe('—')
    expect(f.summary.some((x) => x.includes('m²'))).toBe(false)
  })
})
