import { describe, expect, it } from 'vitest'
import type { Review } from '../../types/domain'
import { propertyListingRating, propertyListingReviews } from './StarRating'

const base = (over: Partial<Review>): Review => ({
  id: 'RV-1',
  targetType: 'property',
  targetId: 'PR-1',
  propertyId: 'PR-1',
  agencyId: 'ag-1',
  authorUserId: 'u-1',
  authorName: 'Test',
  rating: 5,
  body: 'Great place to stay',
  createdAt: '2026-01-01',
  ...over,
})

describe('propertyListingReviews', () => {
  it('includes property and application reviews for the listing', () => {
    const reviews = [
      base({ id: 'a', targetType: 'property', rating: 4 }),
      base({ id: 'b', targetType: 'application', targetId: 'APP-1', rating: 2 }),
      base({ id: 'c', propertyId: 'PR-2', rating: 5 }),
      base({ id: 'd', targetType: 'agent', targetId: 'u-agent', rating: 5 }),
    ]
    expect(propertyListingReviews(reviews, 'PR-1')).toHaveLength(2)
  })

  it('propertyListingRating averages matching reviews', () => {
    const reviews = [
      base({ id: 'a', rating: 4 }),
      base({ id: 'b', targetType: 'application', rating: 2 }),
    ]
    expect(propertyListingRating(reviews, 'PR-1')).toBe(3)
    expect(propertyListingRating([], 'PR-1')).toBeNull()
  })
})
