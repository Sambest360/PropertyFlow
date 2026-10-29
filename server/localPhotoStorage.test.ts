import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localFilePath, photoStorageConfigured, uploadPhotoDataUrl } from './photoStorage.js'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('local photo storage (self-hosted)', () => {
  const prev = { ...process.env }
  afterEach(() => {
    process.env = { ...prev }
  })

  it('writes the photo to the uploads folder and returns an /api/files URL', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pf-up-'))
    process.env.UPLOADS_DIR = dir
    expect(photoStorageConfigured()).toBe(true)
    const url = await uploadPhotoDataUrl(PNG, 'agency/test/listings')
    expect(url.startsWith('/api/files/agency/test/listings/')).toBe(true)
    const full = localFilePath(url.replace('/api/files/', ''))!
    expect(readFileSync(full).length).toBeGreaterThan(10)
  })

  it('refuses paths that leave the uploads folder', () => {
    process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'pf-up-'))
    expect(localFilePath('../../etc/passwd')).toBeNull()
  })
})
