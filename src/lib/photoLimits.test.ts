import { describe, expect, it } from 'vitest'
import { MAX_PHOTO_BYTES, checkTicketPhotos, dataUrlDecodedBytes } from './photoLimits'

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
})
