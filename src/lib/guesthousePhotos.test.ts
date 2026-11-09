import { describe, expect, it } from 'vitest'
import { joinGuesthousePhotos, splitGuesthousePhotos } from './guesthousePhotos'

describe('guest-house photos: uploads + pasted links (P5)', () => {
  it('split puts /api/files/ uploads first (in order) and the rest in the links box', () => {
    expect(splitGuesthousePhotos(['/api/files/a.jpg', 'https://images.pexels.com/b.jpg', '/api/files/c.jpg'])).toEqual({
      uploaded: ['/api/files/a.jpg', '/api/files/c.jpg'],
      links: 'https://images.pexels.com/b.jpg',
    })
  })
  it('join puts uploads first in dropzone order and drops duplicates', () => {
    expect(joinGuesthousePhotos(['/api/files/c.jpg', '/api/files/a.jpg'], ' https://x.test/1.jpg\n\n/api/files/a.jpg https://x.test/1.jpg ')).toEqual({
      photos: ['/api/files/c.jpg', '/api/files/a.jpg', 'https://x.test/1.jpg'],
      failedUploads: 0,
    })
  })
  it('a data: entry (failed upload) is dropped and counted', () => {
    expect(joinGuesthousePhotos(['/api/files/a.jpg', 'data:image/png;base64,AAAA'], '')).toEqual({ photos: ['/api/files/a.jpg'], failedUploads: 1 })
  })
  it('at most 20 photos', () => {
    const many = Array.from({ length: 15 }, (_, i) => `/api/files/${i}.jpg`)
    const links = Array.from({ length: 15 }, (_, i) => `https://x.test/${i}.jpg`).join('\n')
    expect(joinGuesthousePhotos(many, links).photos).toHaveLength(20)
  })
  it('a blank links box adds nothing', () => {
    expect(joinGuesthousePhotos(['/api/files/a.jpg'], '   \n ').photos).toEqual(['/api/files/a.jpg'])
  })
})
