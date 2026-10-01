import { describe, expect, it } from 'vitest'
import {
  canonicalListingId,
  collapseListingPrefix,
  findByListingId,
  listingIdAliases,
  listingIdsMatch,
  nextUniquePropertyId,
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

  // P0-collision (R10): the rent/sale overwrite defect — a new listing must
  // never mint an id resolving to an existing listing's public route.
  describe('nextUniquePropertyId', () => {
    it('passes through a fresh id', () => {
      expect(nextUniquePropertyId(['unt-aaa111'], () => 'unt-bbb222')).toBe('unt-bbb222')
    })

    it('regenerates when the candidate collides with an existing property id', () => {
      const queue = ['unt-ljn8sf', 'unt-zzz999']
      const id = nextUniquePropertyId(['unt-ljn8sf'], () => queue.shift()!)
      expect(id).toBe('unt-zzz999')
    })

    it('treats aliases of existing ids as taken', () => {
      const queue = ['ljn8sf', 'unt-zzz999']
      // PR-ljn8sf's alias space includes the bare suffix 'ljn8sf'
      const id = nextUniquePropertyId(['PR-ljn8sf'], () => queue.shift()!)
      expect(id).toBe('unt-zzz999')

      const queue2 = ['unt-PR-ljn8sf', 'unt-zzz999']
      const id2 = nextUniquePropertyId(['PR-ljn8sf'], () => queue2.shift()!)
      expect(id2).toBe('unt-zzz999')
    })

    it('is case-insensitive', () => {
      const queue = ['unt-ljn8sf', 'unt-zzz999']
      const id = nextUniquePropertyId(['UNT-LJN8SF'], () => queue.shift()!)
      expect(id).toBe('unt-zzz999')
    })

    it('forces uniqueness after repeated collisions', () => {
      const id = nextUniquePropertyId(['unt-aaa111'], () => 'unt-aaa111')
      expect(id).not.toBe('unt-aaa111')
      expect(id.startsWith('unt-')).toBe(true)
    })
  })
})
