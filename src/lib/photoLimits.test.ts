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
  it("this site's own stored photos (self-hosted disk) are kept; other paths are not", () => {
    const own = '/api/files/agency/9f1c2b7e-1d2a-4c3b-8e9f-0a1b2c3d4e5f/listings/2026-10/3f2b.webp'
    expect(isSafePhotoUrl(own)).toBe(true)
    expect(isSafePhotoUrl('/api/files/../../etc/passwd.png')).toBe(false)
    expect(isSafePhotoUrl('/api/files/a/b.svg')).toBe(false)
    expect(isSafePhotoUrl('/api/files/listings/2026-10/a.jpg')).toBe(true)
    expect(isSafePhotoUrl('/api/bootstrap')).toBe(false)
    expect(isSafePhotoUrl('//evil.example/a.jpg')).toBe(false)
    expect(checkPhotos([own, '/etc/passwd', 'javascript:x'], { maxCount: 8 })).toEqual({ ok: true, urls: [own] })
  })
})
