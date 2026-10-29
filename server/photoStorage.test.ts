import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const queryMock = vi.fn()
vi.mock('./db.js', () => ({ query: (...args: unknown[]) => queryMock(...args) }))

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const OLD = 'https://abc.supabase.co/storage/v1/object/public/listing-photos/2026-01/x.png'

describe('photoStorage', () => {
  beforeEach(() => {
    vi.resetModules()
    queryMock.mockReset()
    process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'pf-photos-'))
  })
  afterEach(() => {
    delete process.env.UPLOADS_DIR
    vi.unstubAllGlobals()
  })

  it('refuses with 503 when storage is switched off', async () => {
    process.env.UPLOADS_DIR = 'off'
    const { uploadPhotoDataUrl } = await import('./photoStorage.js')
    await expect(uploadPhotoDataUrl(PNG, 'listings')).rejects.toMatchObject({ status: 503 })
  })

  it('rejects non-images', async () => {
    const { uploadPhotoDataUrl } = await import('./photoStorage.js')
    await expect(uploadPhotoDataUrl('data:text/html;base64,PGh0bWw+', 'listings')).rejects.toMatchObject({ status: 400 })
  })

  it('moves inline and old-bucket photos to disk and keeps other links', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })))
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT id::text AS id, images FROM units')) {
        return [{ id: 'u-1', images: [PNG, OLD, '/api/files/keep.jpg'] }]
      }
      return []
    })
    const { migrateOldPhotosBatch } = await import('./photoStorage.js')
    const r = await migrateOldPhotosBatch(3)
    expect(r).toMatchObject({ movedRows: 1, movedPhotos: 2, failedRows: [] })
    const update = queryMock.mock.calls.find((c) => String(c[0]).startsWith('UPDATE units'))!
    const saved = JSON.parse(update[1][1] as string)
    expect(saved[0]).toMatch(/^\/api\/files\/migrated\/units\//)
    expect(saved[1]).toMatch(/^\/api\/files\/migrated\/units\/.+\.png$/)
    expect(saved[2]).toBe('/api/files/keep.jpg')
  })

  it('leaves the row untouched when a download fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gone', { status: 404 })))
    queryMock.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT id::text AS id, images FROM units') ? [{ id: 'u-1', images: [OLD] }] : [],
    )
    const { migrateOldPhotosBatch } = await import('./photoStorage.js')
    const r = await migrateOldPhotosBatch(3)
    expect(r.failedRows).toEqual(['units:u-1'])
    expect(queryMock.mock.calls.some((c) => String(c[0]).startsWith('UPDATE'))).toBe(false)
  })
})
