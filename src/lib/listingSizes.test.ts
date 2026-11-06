import { describe, expect, it } from 'vitest'
import {
  ERF_SIZE_HINT,
  ERF_SIZE_LABEL,
  bedsLabel,
  effectiveFloorSizeSqm,
  isResidentialType,
  listingDetailFacts,
  listingSizeFacts,
  MAX_ERF_SIZE_SQM,
  MAX_FLOOR_SIZE_SQM,
  parseFloorSizeSqm,
  parseSizeSqm,
  titleTypeWarning,
  typeForBedsDisplay,
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
  it('strings must be plain decimals: hex, exponent, sign and commas are invalid', () => {
    expect(parseSizeSqm('0x10')).toBe('invalid')
    expect(parseSizeSqm('1e3')).toBe('invalid')
    expect(parseSizeSqm('+5')).toBe('invalid')
    expect(parseSizeSqm('12,5')).toBe('invalid')
    expect(parseSizeSqm('Infinity')).toBe('invalid')
    expect(parseSizeSqm(' 600.50 ')).toBe(600.5)
    expect(parseSizeSqm('.5')).toBe(0.5)
    expect(parseSizeSqm('12.')).toBe(12)
  })
})

describe('size maximums follow the column types (C-2)', () => {
  it('erf: NUMERIC(12,2) → 9 999 999 999.99', () => {
    expect(MAX_ERF_SIZE_SQM).toBe(9_999_999_999.99)
    expect(parseSizeSqm(9_999_999_999.99)).toBe(9_999_999_999.99)
    expect(parseSizeSqm('9999999999.99')).toBe(9_999_999_999.99)
    expect(parseSizeSqm(1e10)).toBe('invalid')
    expect(parseSizeSqm('9999999999.995')).toBe('invalid')
  })
  it('floor: NUMERIC(10,2) → 99 999 999.99', () => {
    expect(MAX_FLOOR_SIZE_SQM).toBe(99_999_999.99)
    expect(parseFloorSizeSqm('99999999.99')).toBe(99_999_999.99)
    expect(parseFloorSizeSqm('100000000')).toBe('invalid')
    expect(parseFloorSizeSqm(1e8)).toBe('invalid')
    expect(parseFloorSizeSqm('99999999.995')).toBe('invalid')
    expect(parseFloorSizeSqm('')).toBeNull()
  })
  it('an explicit floor size above the floor maximum does not win over the room sum', () => {
    expect(effectiveFloorSizeSqm('100000000', [{ areaSqm: '40' }])).toBe(40)
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
    expect(bedsLabel('Office', 3)).toBeNull()
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

describe('T1 / A16: bedsLabel hides commercial and vacant-land counts; Farm keeps a count above 0', () => {
  it('hides Industrial, Office and Vacant Land even when n > 0', () => {
    expect(bedsLabel('Industrial', 1)).toBeNull()
    expect(bedsLabel('Office', 3)).toBeNull()
    expect(bedsLabel('Vacant Land', 2)).toBeNull()
  })
  it('keeps residential and student labels', () => {
    expect(bedsLabel('Apartment', 2)).toBe('2 bed')
    expect(bedsLabel('House', 0)).toBe('Bachelor/Studio')
    expect(bedsLabel('Student Accommodation', 1)).toMatch(/1 bed/)
  })
  it('A16: Farm with 4 beds shows them; Farm with 0 hides them (no Bachelor/Studio)', () => {
    expect(bedsLabel('Farm', 4)).toBe('4 bed')
    expect(bedsLabel('Farm', 0)).toBeNull()
  })
  it('A16: Vacant Land with a stray value still hides the count', () => {
    expect(bedsLabel('Vacant Land', 3)).toBeNull()
  })
})

describe('T2 / A16: listingDetailFacts omits bedrooms/bathrooms for non-residential (Farm excepted when count > 0)', () => {
  const base = { parking: 1, area: 217, erfSizeSqm: null as number | null, rooms: [{}, {}] }
  it('Industrial with leftover beds and baths has no bedrooms/bathrooms/Bachelor/Studio', () => {
    const f = listingDetailFacts({ ...base, type: 'Industrial', beds: 1, baths: 1 })
    expect(f.summary.some((x) => /bedroom|bathroom|Bachelor\/Studio/i.test(x))).toBe(false)
    expect(f.summary).toContain('1 parking')
    expect(f.summary).toContain('217 m² floor')
    expect(f.summary).toContain('2 configured rooms')
  })
  it('A16: Farm with 4 beds and 2 baths shows them', () => {
    const f = listingDetailFacts({ ...base, type: 'Farm', beds: 4, baths: 2, area: 20000 })
    expect(f.summary).toContain('4 bedrooms')
    expect(f.summary).toContain('2 bathrooms')
  })
  it('A16: Farm with 0 beds hides bed/bath facts and does not say Bachelor/Studio', () => {
    const f = listingDetailFacts({ ...base, type: 'Farm', beds: 0, baths: 0, area: 20000 })
    expect(f.summary.some((x) => /bedroom|bathroom|Bachelor\/Studio/i.test(x))).toBe(false)
  })
  it('A16: Vacant Land with a stray 2 beds / 1 bath still hides them', () => {
    const f = listingDetailFacts({ ...base, type: 'Vacant Land', beds: 2, baths: 1, area: 1000 })
    expect(f.summary.some((x) => /bedroom|bathroom|Bachelor\/Studio/i.test(x))).toBe(false)
  })
})

describe('titleTypeConfirmPrompt: publish dialog copy (addendum1)', () => {
  it('is a short sentence without the draft "will not stop the save" wording', async () => {
    const mod = await import('./listingSizes')
    expect(mod).toHaveProperty('titleTypeConfirmPrompt')
    const prompt = (mod as { titleTypeConfirmPrompt: (title: string, type: string) => string | null }).titleTypeConfirmPrompt
    expect(prompt('3 Bedroom House to Rent in Pinelands', 'Apartment')).toBe(
      'The title says "house" but the type is Apartment.',
    )
    expect(prompt('Industrial Property to Rent in Fairview', 'Apartment')).toBe(
      'The title says "industrial" but the type is Apartment.',
    )
    expect(prompt('3 Bedroom House to Rent in Pinelands', 'Apartment')).not.toMatch(/will not stop the save/)
    expect(prompt('Sunny apartment', 'Apartment')).toBeNull()
  })
})


describe('Q2 / D2: typeForBedsDisplay (inferred hide + studio suppression)', () => {
  it('suppresses Bachelor/Studio for an inferred 0-bed residential listing', () => {
    expect(typeForBedsDisplay({ type: 'House', typeInferred: true, beds: 0 })).toBeNull()
    expect(bedsLabel(typeForBedsDisplay({ type: 'House', typeInferred: true, beds: 0 }), 0)).toBeNull()
  })
  it('still hides leftover counts on inferred commercial and Vacant Land', () => {
    expect(bedsLabel(typeForBedsDisplay({ type: 'Industrial', typeInferred: true, beds: 1 }), 1)).toBeNull()
    expect(bedsLabel(typeForBedsDisplay({ type: 'Vacant Land', typeInferred: true, beds: 2 }), 2)).toBeNull()
  })
  it('inferred Farm with 4 beds still shows them', () => {
    expect(bedsLabel(typeForBedsDisplay({ type: 'Farm', typeInferred: true, beds: 4 }), 4)).toBe('4 bed')
  })
  it('a chosen House with 0 beds still shows Bachelor/Studio', () => {
    expect(bedsLabel(typeForBedsDisplay({ type: 'House', typeInferred: false, beds: 0 }), 0)).toBe('Bachelor/Studio')
    expect(typeForBedsDisplay({ type: 'House', typeInferred: false, beds: 0 })).toBe('House')
  })
})
