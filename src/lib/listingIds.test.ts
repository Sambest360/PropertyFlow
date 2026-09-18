import { describe, expect, it } from 'vitest'
import {
  canonicalListingId,
  collapseListingPrefix,
  findByListingId,
  listingIdAliases,
  listingIdsMatch,
  unitIdForProperty,
} from './listingIds'

describe('listingIds', () => {
  it('collapses doubled unt- and PR- prefixes', () => {
    expect(collapseListingPrefix('unt-unt-sg2rt5')).toBe('unt-sg2rt5')
    expect(collapseListingPrefix('PR-PR-imuc3d')).toBe('PR-imuc3d')
    expect(canonicalListingId('unt-unt-unt-x')).toBe('unt-x')
  })

  it('does not prefix unit ids that already start with unt-', () => {
    expect(unitIdForProperty('unt-sg2rt5')).toBe('unt-sg2rt5')
    expect(unitIdForProperty('PR-imuc3d')).toBe('unt-PR-imuc3d')
  })

  it('matches staff property id to public aliases', () => {
    expect(listingIdsMatch('unt-sg2rt5', 'unt-unt-sg2rt5')).toBe(true)
    expect(listingIdsMatch('PR-imuc3d', 'unt-PR-imuc3d')).toBe(true)
    expect(listingIdAliases('PR-imuc3d')).toContain('unt-PR-imuc3d')
  })

  it('finds a property by listing URL param aliases', () => {
    const properties = [
      { id: 'unt-sg2rt5', unitId: 'unt-sg2rt5', title: 'Live' },
      { id: 'PR-other', unitId: 'unt-PR-other', title: 'Other' },
    ]
    expect(findByListingId(properties, 'unt-unt-sg2rt5')?.title).toBe('Live')
    expect(findByListingId(properties, 'unt-sg2rt5')?.title).toBe('Live')
  })
})
