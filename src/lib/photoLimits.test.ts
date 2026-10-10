import { describe, expect, it } from 'vitest'
import { MAX_PHOTO_BYTES, MAX_TICKET_PHOTOS, checkPhotos, checkTicketPhotos, dataUrlDecodedBytes, isSafePhotoUrl } from './photoLimits'

describe('photoLimits', () => {
  it('measures decoded bytes, not data-URL length', () => {
    expect(dataUrlDecodedBytes('data:image/png;base64,AAAA')).toBe(3)
    expect(dataUrlDecodedBytes('data:image/png;base64,AA==')).toBe(1)
    expect(dataUrlDecodedBytes('https://x')).toBeNull()
  })
  it('600 KB decoded is the per-photo cap', () => {
    const at = `data:image/jpeg;base64,${'A'.repeat((MAX_PHOTO_BYTES / 3) * 4)}`
    expect(checkTicketPhotos([at]).ok).toBe(true)
    expect(checkTicketPhotos([`${at}AAAA`]).ok).toBe(false)
  })

  it('generic checkPhotos takes a max count (P3a: 8); tickets cap at 10', () => {
    const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://x.example/${i}.jpg`)
    expect(MAX_TICKET_PHOTOS).toBe(10)
    expect(checkPhotos(urls(8), { maxCount: 8 }).ok).toBe(true)
    expect(checkPhotos(urls(9), { maxCount: 8 }).ok).toBe(false)
    expect(checkTicketPhotos(urls(10)).ok).toBe(true)
    expect(checkTicketPhotos(urls(11)).ok).toBe(false)
  })
  it('isSafePhotoUrl', () => {
    expect(isSafePhotoUrl('javascript:alert(1)')).toBe(false)
    expect(isSafePhotoUrl('data:image/gif;base64,R0lG')).toBe(false)
    expect(isSafePhotoUrl('data:image/png;base64,AAAA')).toBe(true)
    expect(isSafePhotoUrl('https://x.example/a.jpg')).toBe(true)
  })
})
