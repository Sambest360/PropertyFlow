import { describe, expect, it } from 'vitest'
import { resolveBuildingGrading } from './buildingGrading'

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
