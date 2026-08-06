import { describe, expect, it } from 'vitest'
import { inferSolarCapacityKw, resolveBuildingGrading } from './buildingGrading'

describe('resolveBuildingGrading', () => {
  it('returns P for borehole plus backup power amenities', () => {
    expect(
      resolveBuildingGrading({
        hasBorehole: true,
        amenities: ['Generator', 'Fibre', 'Pool'],
      }),
    ).toBe('P')
  })

  it('returns A for load-shedding backup with multiple premium amenities', () => {
    expect(
      resolveBuildingGrading({
        hasBorehole: false,
        amenities: ['Solar', 'Pool', 'Gym'],
      }),
    ).toBe('A')
  })

  it('returns C for vacant land', () => {
    expect(
      resolveBuildingGrading({
        hasBorehole: false,
        amenities: [],
        propertyType: 'Vacant Land',
      }),
    ).toBe('C')
  })

  it('returns B for borehole without other premium amenities', () => {
    expect(
      resolveBuildingGrading({
        hasBorehole: true,
        amenities: ['Pet friendly'],
      }),
    ).toBe('B')
  })
})

describe('inferSolarCapacityKw', () => {
  it('infers higher kW for explicit solar systems', () => {
    expect(inferSolarCapacityKw(['Solar panels'])).toBe(10)
    expect(inferSolarCapacityKw(['Solar'])).toBe(5)
    expect(inferSolarCapacityKw(['Generator'])).toBe(3)
    expect(inferSolarCapacityKw(['Fibre'])).toBe(0)
  })
})
