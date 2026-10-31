import { describe, expect, it } from 'vitest'
import type { PropertyAsset } from '../types/domain'
import { PLATFORM_CATALOGUE } from '../data/platformLookups'
import { summarizeRooms } from './roomSummary'
import {
  INITIAL_WIZARD_PROPERTY_TYPE,
  defaultWizardRooms,
  draftFromProperty,
  wizardRoomRowsForSave,
  wizardRoomsStepError,
  wizardSizesForSave,
  wizardTypeError,
  wizardTypeOptions,
} from './propertyWizardDraft'

const property = (over: Partial<PropertyAsset> = {}): PropertyAsset =>
  ({
    id: 'unt-t2',
    agencyId: 'ag-1',
    landlordId: '',
    agentId: null,
    buildingId: '',
    unitId: 'unt-t2',
    title: 'Unit',
    type: 'Apartment',
    status: 'Draft',
    listingMode: 'rent',
    price: null,
    rent: 5000,
    beds: 0,
    baths: 1,
    parking: 0,
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
    ...over,
  }) as PropertyAsset

describe('T2: no default property type, the wizard cannot submit without one', () => {
  it('a new wizard starts with no type selected', () => {
    expect(INITIAL_WIZARD_PROPERTY_TYPE).toBe('')
    expect(wizardTypeError(INITIAL_WIZARD_PROPERTY_TYPE)).toBe('Select a property type.')
    expect(wizardTypeError('   ')).toBe('Select a property type.')
    expect(wizardTypeError('Industrial')).toBeNull()
  })
})

describe('T2: Industrial, Commercial and Farm are offered', () => {
  it('in the platform catalogue', () => {
    const keys = PLATFORM_CATALOGUE.PROPERTY_TYPE.map((t) => t.key)
    for (const k of ['Industrial', 'Commercial', 'Farm']) expect(keys).toContain(k)
  })
  it('even when an agency lookup list predates them, unless the agency hid them', () => {
    const fromDb = [
      { value: 'House', label: 'House' },
      { value: 'Apartment', label: 'Apartment' },
    ]
    const out = wizardTypeOptions(fromDb, new Set(['House', 'Apartment']))
    expect(out.map((o) => o.value)).toEqual(['House', 'Apartment', 'Industrial', 'Commercial', 'Farm'])
    const hidden = wizardTypeOptions(fromDb, new Set(['House', 'Apartment', 'Farm']))
    expect(hidden.map((o) => o.value)).not.toContain('Farm')
  })
})

describe('T2: beds = 0 is valid, an empty room set gives 0 beds not 1', () => {
  it('saves no rooms when none were entered (no default bedroom)', () => {
    const rows = wizardRoomRowsForSave([])
    expect(rows).toEqual([])
    expect(summarizeRooms(rows).bedrooms).toBe(0)
  })
  it('does not block a residential save with no rooms', () => {
    expect(wizardRoomsStepError({ propertyType: 'Apartment', rooms: [], erfSizeSqm: '', floorSizeSqm: '' })).toBeNull()
  })
  it('still asks for room names', () => {
    const rooms = [{ ...defaultWizardRooms()[0], name: ' ' }]
    expect(wizardRoomsStepError({ propertyType: 'House', rooms, erfSizeSqm: '', floorSizeSqm: '' })).toBe('Every room needs a name.')
  })
  it('editing a 0-bed listing with no rooms keeps 0 beds', () => {
    const d = draftFromProperty(property({ beds: 0, rooms: [] }), undefined, [])
    expect(summarizeRooms(d.rooms).bedrooms).toBe(0)
  })
})

describe('T2: erf / stand size is optional and separate from floor size', () => {
  const rooms = [
    { ...defaultWizardRooms()[0], areaSqm: '20' },
    { ...defaultWizardRooms()[1], areaSqm: '15' },
  ]
  it('is never required, also for land', () => {
    for (const t of ['Vacant Land', 'Farm', 'Apartment']) {
      expect(wizardRoomsStepError({ propertyType: t, rooms: t === 'Apartment' ? rooms : [], erfSizeSqm: '', floorSizeSqm: '' })).toBeNull()
    }
  })
  it('rejects a negative size', () => {
    expect(wizardRoomsStepError({ propertyType: 'House', rooms, erfSizeSqm: '-5', floorSizeSqm: '' })).toMatch(/erf/i)
    expect(wizardRoomsStepError({ propertyType: 'House', rooms, erfSizeSqm: '', floorSizeSqm: '-5' })).toMatch(/floor/i)
  })
  it('floor 250 and erf 600 are saved as two values, never summed', () => {
    const s = wizardSizesForSave({ propertyType: 'House', rooms, floorSizeSqm: '250', erfSizeSqm: '600' }, { erfSupported: true })
    expect(s).toEqual({ area: 250, erfSizeSqm: 600 })
  })
  it('without a floor entry the floor is the room sum, erf stays its own', () => {
    expect(wizardSizesForSave({ propertyType: 'House', rooms, floorSizeSqm: '', erfSizeSqm: '600' }, { erfSupported: true })).toEqual({
      area: 35,
      erfSizeSqm: 600,
    })
  })
  it('a blank erf clears it (sectional title)', () => {
    expect(wizardSizesForSave({ propertyType: 'Apartment', rooms, floorSizeSqm: '', erfSizeSqm: '' }, { erfSupported: true })).toEqual({
      area: 35,
      erfSizeSqm: null,
    })
  })
  it('sends no erf at all while the database has no erf column', () => {
    const s = wizardSizesForSave({ propertyType: 'House', rooms, floorSizeSqm: '250', erfSizeSqm: '600' }, { erfSupported: false })
    expect(s).toEqual({ area: 250 })
    expect('erfSizeSqm' in s).toBe(false)
  })
  it('edit: seeds floor only when it differs from the room sum, erf from erfSizeSqm only', () => {
    const infra = [
      { id: 'r1', clientId: 'ag-1', unitId: 'unt-t2', name: 'Bedroom', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 20 },
      { id: 'r2', clientId: 'ag-1', unitId: 'unt-t2', name: 'Bathroom', kind: 'bathroom', beds: 0, baths: 1, areaSqm: 15 },
    ] as never
    const explicit = draftFromProperty(property({ area: 250, erfSizeSqm: 600, beds: 1 }), undefined, infra)
    expect(explicit.floorSizeSqm).toBe('250')
    expect(explicit.erfSizeSqm).toBe('600')
    const summed = draftFromProperty(property({ area: 35, erfSizeSqm: null, beds: 1 }), undefined, infra)
    expect(summed.floorSizeSqm).toBe('')
    expect(summed.erfSizeSqm).toBe('')
  })
  it('edit: a legacy land row never derives erf from the floor size', () => {
    const d = draftFromProperty(property({ type: 'Vacant Land', area: 800, erfSizeSqm: undefined }), undefined, [])
    expect(d.erfSizeSqm).toBe('')
  })
})

describe('T2 C-2: floor size fits units.square_meters NUMERIC(10,2)', () => {
  const room = (areaSqm: string) => ({ id: 'r1', name: 'Hall', kind: 'living', beds: 0, baths: 0, areaSqm }) as never
  it('blocks a floor size of 100 000 000 m² or more, allows 99 999 999.99', () => {
    expect(wizardRoomsStepError({ propertyType: 'Industrial', rooms: [], erfSizeSqm: '', floorSizeSqm: '100000000' })).toMatch(/Floor size/)
    expect(wizardRoomsStepError({ propertyType: 'Industrial', rooms: [], erfSizeSqm: '', floorSizeSqm: '99999999.99' })).toBeNull()
  })
  it('blocks a room sum over the maximum when the floor size is blank', () => {
    expect(
      wizardRoomsStepError({ propertyType: 'Industrial', rooms: [room('60000000'), room('60000000')], erfSizeSqm: '', floorSizeSqm: '' }),
    ).toMatch(/room sizes add up/)
  })
  it('erf keeps its own, larger maximum (NUMERIC(12,2))', () => {
    expect(wizardRoomsStepError({ propertyType: 'Farm', rooms: [], erfSizeSqm: '9999999999.99', floorSizeSqm: '' })).toBeNull()
    expect(wizardRoomsStepError({ propertyType: 'Farm', rooms: [], erfSizeSqm: '10000000000', floorSizeSqm: '' })).toMatch(/Erf/)
    expect(wizardRoomsStepError({ propertyType: 'Farm', rooms: [], erfSizeSqm: '1e3', floorSizeSqm: '' })).toMatch(/Erf/)
  })
})
