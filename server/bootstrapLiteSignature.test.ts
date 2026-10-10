import { describe, expect, it, vi } from 'vitest'

vi.mock('./db.js', () => ({ query: vi.fn(async () => []), databaseConfigured: true }))

describe('CR10 fix 4: lite bootstrap strips signatureDataUrl', () => {
  it('drops images from both party blocks, keeps status / method / hash', async () => {
    const { stripESignImages } = await import('./bootstrap.js')
    const PNG = 'data:image/png;base64,AAAA'
    const out = stripESignImages({
      envelopeId: 'ENV-1',
      status: 'partially_signed',
      tenant: { status: 'signed', method: 'drawn', signatureDataUrl: PNG, imageSha256: 'abc' },
      landlord: { status: 'pending', signatureDataUrl: PNG },
    })
    expect(JSON.stringify(out)).not.toContain('signatureDataUrl')
    expect(out).toMatchObject({ envelopeId: 'ENV-1', tenant: { status: 'signed', method: 'drawn', imageSha256: 'abc' } })
    expect(stripESignImages(null)).toBeNull()
  })
})
