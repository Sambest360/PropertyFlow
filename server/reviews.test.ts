import { describe, expect, it } from 'vitest'
import { cleanSubRatings, publicAuthorName, summarize } from './reviews.js'

describe('reviews', () => {
  it('shows first name and surname initial only', () => {
    expect(publicAuthorName('Thandi Mokoena')).toBe('Thandi M.')
    expect(publicAuthorName('Sipho')).toBe('Sipho')
  })
  it('keeps only valid category ratings for the review kind', () => {
    expect(cleanSubRatings('property', { accuracy: 5, value: 9, communication: 4 })).toEqual({ accuracy: 5 })
  })
  it('summarises average, breakdown and category averages', () => {
    const s = summarize([
      { rating: 5, sub_ratings: { value: 4 }, target_type: 'property' },
      { rating: 3, sub_ratings: { value: 2 }, target_type: 'property' },
      { rating: 4, sub_ratings: {}, target_type: 'agent' },
    ])
    expect(s.average).toBe(4)
    expect(s.distribution[5]).toBe(1)
    expect(s.subAverages.value).toBe(3)
    expect(s.byTarget.agent.count).toBe(1)
  })
})
