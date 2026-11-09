import { describe, expect, it } from 'vitest'
import { validatePropertyReadyToPublish } from './propertyStatus'
import type { PropertyAsset } from '../types/domain'

/** B1 u1b: the client check has the same price rule as server/listingReadiness.ts. */
const draft = (over: Partial<PropertyAsset>) =>
  ({ status: 'Draft', title: 'Flat', images: ['/api/files/a.jpg'], address: '', suburb: 'Summerstrand', ...over }) as PropertyAsset

describe('validatePropertyReadyToPublish: price (B1 u1b)', () => {
  it('a Draft with no rent and no sale price is not ready', () => {
    expect(validatePropertyReadyToPublish(draft({ rent: undefined, price: undefined }))).toBe('Add a rent or sale price before publishing.')
    expect(validatePropertyReadyToPublish(draft({ rent: 0, price: 0 }))).toBe('Add a rent or sale price before publishing.')
  })
  it('a rent makes it ready; a non-Draft is never checked', () => {
    expect(validatePropertyReadyToPublish(draft({ rent: 8500 }))).toBeNull()
    expect(validatePropertyReadyToPublish(draft({ status: 'Published', rent: undefined, price: undefined }))).toBeNull()
  })
})
