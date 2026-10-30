import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  LISTING_PHOTO_TOO_LARGE,
  MAX_LISTING_PHOTO_BYTES,
  listingPhotosLabel,
  normalizeListingImages,
  partitionPhotosBySize,
} from './listingPhotos'

describe('listing photo limits (P3a)', () => {
  it('no photo-count cap: "Photos (n)" counter, no max on the wizard dropzone', () => {
    expect(listingPhotosLabel(3)).toBe('Photos (3)')
    expect(listingPhotosLabel(40)).toBe('Photos (40)')
    const create = readFileSync('src/pages/property/PropertyCreatePage.tsx', 'utf8')
    expect(create).not.toMatch(/max=\{MAX_LISTING_PHOTOS\}/)
  })
  it('normalizeListingImages trims, drops empties, dedupes in order', () => {
    expect(normalizeListingImages([' https://a/x ', '', 'https://a/x', 'https://b/y'])).toEqual([
      'https://a/x',
      'https://b/y',
    ])
    expect(normalizeListingImages([])).toEqual([])
  })

  it('refuses photos over 600 KB after resizing, with the message', () => {
    expect(MAX_LISTING_PHOTO_BYTES).toBe(600 * 1024)
    const { ok, refused } = partitionPhotosBySize(['a'.repeat(100), 'b'.repeat(MAX_LISTING_PHOTO_BYTES + 1)])
    expect(ok).toHaveLength(1)
    expect(refused).toBe(1)
    expect(LISTING_PHOTO_TOO_LARGE).toMatch(/600 KB/)
  })
})
