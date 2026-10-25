import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const upload = vi.fn()
const queryMock = vi.fn()

vi.mock('./supabase/admin.js', () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
  }),
}))
vi.mock('./db.js', () => ({ query: (...args: unknown[]) => queryMock(...args) }))

const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('photoStorage', () => {
  beforeEach(() => {
    vi.resetModules()
    upload.mockReset().mockResolvedValue({ error: null })
    queryMock.mockReset()
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'
  })
  afterEach(() => {
    delete process.env.SUPABASE_SECRET_KEY
  })

  it('refuses with 503 when Storage is not configured', async () => {
    delete process.env.SUPABASE_SECRET_KEY
    const { uploadPhotoDataUrl } = await import('./photoStorage.js')
    await expect(uploadPhotoDataUrl(PNG, 'listings')).rejects.toMatchObject({ status: 503 })
  })

  it('uploads an image and returns its public URL; rejects non-images', async () => {
    const { uploadPhotoDataUrl } = await import('./photoStorage.js')
    const url = await uploadPhotoDataUrl(PNG, 'listings')
    expect(url).toMatch(/^https:\/\/cdn\.test\/listings\/\d{4}-\d{2}\/.+\.png$/)
    await expect(uploadPhotoDataUrl('data:text/html;base64,PGh0bWw+', 'listings')).rejects.toMatchObject({ status: 400 })
  })

  it('rewrites a row only after its inline photos uploaded, keeping existing links', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT id::text AS id, images FROM units')) {
        return [{ id: 'u-1', images: [PNG, 'https://cdn.test/old.jpg'] }]
      }
      if (sql.startsWith('SELECT id::text AS id, images FROM buildings')) return []
      if (sql.startsWith('SELECT count(*)')) return [{ n: '0' }]
      return []
    })
    const { migrateInlinePhotosBatch } = await import('./photoStorage.js')
    const r = await migrateInlinePhotosBatch(3)
    expect(r).toMatchObject({ movedRows: 1, movedPhotos: 1, remaining: { units: 0, buildings: 0 } })
    const update = queryMock.mock.calls.find((c) => String(c[0]).startsWith('UPDATE units'))!
    const saved = JSON.parse(update[1][1] as string)
    expect(saved[0]).toMatch(/^https:\/\/cdn\.test\/migrated\/units\//)
    expect(saved[1]).toBe('https://cdn.test/old.jpg')
  })

  it('leaves the row untouched when an upload fails', async () => {
    upload.mockResolvedValue({ error: { message: 'boom' } })
    queryMock.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT id::text AS id, images FROM units') ? [{ id: 'u-1', images: [PNG] }] : [],
    )
    const { migrateInlinePhotosBatch } = await import('./photoStorage.js')
    await expect(migrateInlinePhotosBatch(3)).rejects.toMatchObject({ status: 502 })
    expect(queryMock.mock.calls.some((c) => String(c[0]).startsWith('UPDATE'))).toBe(false)
  })
})
