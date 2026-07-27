import { afterEach, describe, expect, it } from 'vitest'
import { getWishlistIds, isOnWishlist, setWishlistIds, toggleWishlist } from './wishlist'

afterEach(() => {
  setWishlistIds('u-test', [])
})

describe('wishlist', () => {
  it('adds and removes a property for a user', () => {
    expect(isOnWishlist('u-test', 'PR-1')).toBe(false)
    expect(toggleWishlist('u-test', 'PR-1')).toEqual({ saved: true, ids: ['PR-1'] })
    expect(isOnWishlist('u-test', 'PR-1')).toBe(true)
    expect(toggleWishlist('u-test', 'PR-1').saved).toBe(false)
    expect(getWishlistIds('u-test')).toEqual([])
  })
})
