import { describe, expect, it } from 'vitest'
import { canonicalListingId, listingIdsMatch } from './listingIds'

describe('P0-4/P1-1: canonical listing dedupe keys', () => {
  it('collapses doubled prefixes', () => {
    expect(canonicalListingId('unt-unt-sg2rt5')).toBe('unt-sg2rt5')
    expect(canonicalListingId('PR-PR-6m1bng')).toBe('PR-6m1bng')
  })

  it('staff property id and unit slug resolve to the same alias set', () => {
    expect(listingIdsMatch('PR-6m1bng', 'unt-PR-6m1bng')).toBe(true)
    expect(listingIdsMatch('unt-sg2rt5', 'sg2rt5')).toBe(true)
  })

  it('distinct listings never collide', () => {
    expect(listingIdsMatch('PR-6m1bng', 'unt-sg2rt5')).toBe(false)
  })
})
