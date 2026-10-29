import { describe, expect, it } from 'vitest'
import { gradeBreakdown, resolveBuildingGrading } from './buildingGrading'

describe('resolveBuildingGrading', () => {
  it('grades a well-equipped home Premium', () => {
    expect(
      resolveBuildingGrading({
        hasBorehole: true,
        amenities: ['Solar', 'Generator', 'Security Estate', 'Alarm system', 'Electric fence', 'Fibre', 'Air conditioning', 'Fitted kitchen', 'Pool', 'Gym', 'Garden'],
        bedrooms: 3,
        bathrooms: 2,
        garages: 2,
      }),
    ).toBe('P')
  })

  it('more and better features raise the grade', () => {
    const basic = gradeBreakdown({ hasBorehole: false, amenities: ['Garden'] })
    const better = gradeBreakdown({ hasBorehole: false, amenities: ['Garden', 'Solar', 'Alarm system'] })
    const best = gradeBreakdown({ hasBorehole: true, amenities: ['Garden', 'Solar', 'Alarm system', 'Security Estate', 'Pool', 'Fibre'] })
    expect(basic.score).toBeLessThan(better.score)
    expect(better.score).toBeLessThan(best.score)
    expect(['C', 'B', 'A', 'P'].indexOf(best.grade)).toBeGreaterThan(['C', 'B', 'A', 'P'].indexOf(basic.grade))
  })

  it('solar earns more than an inverter', () => {
    const solar = gradeBreakdown({ hasBorehole: false, amenities: ['Solar'] }).score
    const ups = gradeBreakdown({ hasBorehole: false, amenities: ['Inverter / UPS'] }).score
    expect(solar).toBeGreaterThan(ups)
  })

  it('one category cannot carry the grade alone', () => {
    const g = gradeBreakdown({ hasBorehole: true, amenities: ['Solar', 'Generator', 'Inverter / UPS', 'Load-shedding free'] })
    expect(g.byCategory.power_water.points).toBe(g.byCategory.power_water.max)
    expect(g.grade).not.toBe('P')
  })

  it('returns C for vacant land', () => {
    expect(resolveBuildingGrading({ hasBorehole: false, amenities: [], propertyType: 'Vacant Land' })).toBe('C')
  })

  it('suggests upgrades the property does not have yet', () => {
    expect(gradeBreakdown({ hasBorehole: false, amenities: ['Solar'] }).suggestions).not.toContain('Solar')
  })
})
