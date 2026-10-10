import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { LISTING_PHOTO_TOO_LARGE, MAX_LISTING_PHOTOS, MAX_LISTING_PHOTO_BYTES, listingPhotosLabel, partitionPhotosBySize } from './listingPhotos'

describe('listing photo limits (P3a)', () => {
  it('8 photos, one named constant, "Photos (n/8)" counter', () => {
    expect(MAX_LISTING_PHOTOS).toBe(8)
    expect(listingPhotosLabel(3)).toBe('Photos (3/8)')
    const create = readFileSync('src/pages/property/PropertyCreatePage.tsx', 'utf8')
    expect(create).toContain('max={MAX_LISTING_PHOTOS}')
  })
  it('refuses photos over 600 KB after resizing, with the message', () => {
    expect(MAX_LISTING_PHOTO_BYTES).toBe(600 * 1024)
    const { ok, refused } = partitionPhotosBySize(['a'.repeat(100), 'b'.repeat(MAX_LISTING_PHOTO_BYTES + 1)])
    expect(ok).toHaveLength(1)
    expect(refused).toBe(1)
    expect(LISTING_PHOTO_TOO_LARGE).toMatch(/600 KB/)
  })
})
