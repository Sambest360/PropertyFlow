import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_MAX_BYTES,
  FileValidationError,
  IMAGE_MAX_BYTES,
  SIGNED_URL_TTL_MS,
  StorageAccessError,
  buildStoragePath,
  isLegacyDataUrl,
  mediaLocator,
  shouldRefreshSignedUrl,
  toStorageRef,
  validateUploadFile,
} from './contract'
import { createMockFileStorage } from './mockStorage'
import { clearSignedUrlCache, resolveMediaSrc } from './resolve'
import { createSupabaseFileStorage, type SupabaseStorageLike } from './supabaseStorage'

function file(name: string, type: string, size = 32): File {
  const bytes = new Uint8Array(size)
  bytes.fill(7)
  return new File([bytes], name, { type })
}

const target = {
  bucket: 'property-media' as const,
  agencyId: 'ag-1',
  entityType: 'property',
  entityId: 'unt-1',
  kind: 'property_image',
  fileClass: 'image' as const,
}

describe('storage contract', () => {
  it('builds the private object path', () => {
    expect(
      buildStoragePath({
        agencyId: 'ag-1',
        entityType: 'ticket',
        entityId: 'MT-9',
        fileId: 'file-1',
        ext: 'jpg',
      }),
    ).toBe('ag-1/ticket/MT-9/file-1.jpg')
  })

  it('refreshes signed urls inside the lead window and not before', () => {
    const now = Date.parse('2026-09-29T12:00:00.000Z')
    const fresh = new Date(now + SIGNED_URL_TTL_MS).toISOString()
    expect(shouldRefreshSignedUrl(fresh, now)).toBe(false)
    const soon = new Date(now + 4 * 60 * 1000).toISOString()
    expect(shouldRefreshSignedUrl(soon, now)).toBe(true)
  })

  it('keeps a legacy data url ahead of a storage id', () => {
    expect(
      mediaLocator({
        dataUrl: 'data:image/png;base64,aaa',
        fileId: 'file-1',
      }),
    ).toBe('data:image/png;base64,aaa')
    expect(mediaLocator({ dataUrl: '', fileId: 'file-1' })).toBe(toStorageRef('file-1'))
    expect(isLegacyDataUrl('data:image/jpeg;base64,xx')).toBe(true)
  })

  it('rejects images and documents outside the client limits', () => {
    expect(validateUploadFile(file('a.jpg', 'image/jpeg', 100), 'image')).toBe('image/jpeg')
    expect(validateUploadFile(file('a.png', 'image/png', 100), 'image')).toBe('image/png')
    expect(validateUploadFile(file('a.webp', 'image/webp', 100), 'image')).toBe('image/webp')
    expect(() => validateUploadFile(file('a.gif', 'image/gif', 100), 'image')).toThrow(FileValidationError)
    expect(() => validateUploadFile(file('a.gif', 'image/gif', 100), 'image')).toThrow(/JPEG, PNG, or WebP/)
    expect(() => validateUploadFile(file('big.jpg', 'image/jpeg', IMAGE_MAX_BYTES + 1), 'image')).toThrow(
      /Photos can be up to 10 MB/,
    )

    expect(validateUploadFile(file('a.pdf', 'application/pdf', 100), 'document')).toBe('application/pdf')
    expect(validateUploadFile(file('a.jpg', 'image/jpeg', 100), 'document')).toBe('image/jpeg')
    expect(validateUploadFile(file('a.png', 'image/png', 100), 'document')).toBe('image/png')
    expect(() => validateUploadFile(file('a.webp', 'image/webp', 100), 'document')).toThrow(/PDF, JPEG, or PNG/)
    expect(() =>
      validateUploadFile(file('big.pdf', 'application/pdf', DOCUMENT_MAX_BYTES + 1), 'document'),
    ).toThrow(/Documents can be up to 20 MB/)
  })
})

describe('mock file storage', () => {
  it('uploads then registers, and lists a signed url valid for one hour', async () => {
    let clock = Date.parse('2026-09-29T12:00:00.000Z')
    const storage = createMockFileStorage({ now: () => clock })
    const result = await storage.upload({ ...target, file: file('cover.jpg', 'image/jpeg') })
    expect(result.path).toBe(`ag-1/property/unt-1/${result.file_id}.jpg`)
    expect(storage.storedPaths()).toEqual([result.path])

    const listed = await storage.listFiles({ entityType: 'property', entityId: 'unt-1' })
    expect(listed).toHaveLength(1)
    expect(listed[0]?.file_id).toBe(result.file_id)
    expect(listed[0]?.kind).toBe('property_image')
    expect(listed[0]?.url).toBeTruthy()
    expect(Date.parse(listed[0]!.expires_at) - clock).toBe(SIGNED_URL_TTL_MS)

    const one = await storage.getFile(result.file_id)
    expect(one.file_id).toBe(result.file_id)
    expect(Date.parse(one.expires_at) - clock).toBe(SIGNED_URL_TTL_MS)
  })

  it('deletes the object when register_file fails', async () => {
    const storage = createMockFileStorage()
    storage.failNextRegister()
    await expect(storage.upload({ ...target, file: file('cover.png', 'image/png') })).rejects.toThrow(
      /register_file failed/,
    )
    expect(storage.storedPaths()).toEqual([])
  })

  it('does not store a file that fails the client limit', async () => {
    const storage = createMockFileStorage()
    await expect(
      storage.upload({ ...target, file: file('anim.gif', 'image/gif', 20) }),
    ).rejects.toThrow(/JPEG, PNG, or WebP/)
    expect(storage.storedPaths()).toEqual([])
  })

  it('surfaces 403 and 404 without throwing out of the resolver', async () => {
    clearSignedUrlCache()
    const storage = createMockFileStorage()
    const uploaded = await storage.upload({
      ...target,
      bucket: 'documents',
      fileClass: 'document',
      kind: 'id_document',
      entityType: 'user',
      file: file('id.pdf', 'application/pdf'),
    })

    storage.failRead(uploaded.file_id, 403)
    await expect(storage.getFile(uploaded.file_id)).rejects.toBeInstanceOf(StorageAccessError)
    const forbidden = await resolveMediaSrc(toStorageRef(uploaded.file_id), { storage })
    expect(forbidden).toMatchObject({ status: 'unavailable', reason: 'forbidden', url: null })

    clearSignedUrlCache()
    storage.failRead(uploaded.file_id, 404)
    const missing = await resolveMediaSrc(toStorageRef(uploaded.file_id), {
      storage,
      legacyFallback: 'data:application/pdf;base64,AAA',
    })
    expect(missing).toMatchObject({
      status: 'ready',
      source: 'legacy',
      url: 'data:application/pdf;base64,AAA',
    })

    clearSignedUrlCache()
    const gone = await resolveMediaSrc(toStorageRef('does-not-exist'), { storage })
    expect(gone).toMatchObject({ status: 'unavailable', reason: 'missing' })
  })

  it('reads an existing data url without calling storage', async () => {
    clearSignedUrlCache()
    const storage = createMockFileStorage()
    const resolved = await resolveMediaSrc('data:image/png;base64,abc', { storage })
    expect(resolved).toMatchObject({ status: 'ready', source: 'legacy', url: 'data:image/png;base64,abc' })
    expect(storage.storedPaths()).toEqual([])
  })

  it('refreshes a signed url once it is inside the lead window', async () => {
    clearSignedUrlCache()
    let clock = Date.parse('2026-09-29T12:00:00.000Z')
    const storage = createMockFileStorage({ now: () => clock })
    const uploaded = await storage.upload({ ...target, file: file('cover.webp', 'image/webp') })
    const first = await resolveMediaSrc(toStorageRef(uploaded.file_id), { storage, now: clock })
    expect(first.status).toBe('ready')
    expect(first.expiresAt).toBe(new Date(clock + SIGNED_URL_TTL_MS).toISOString())

    clock += SIGNED_URL_TTL_MS - 60 * 1000
    clearSignedUrlCache()
    const refreshed = await resolveMediaSrc(toStorageRef(uploaded.file_id), { storage, now: clock })
    expect(refreshed.status).toBe('ready')
    expect(Date.parse(refreshed.expiresAt ?? '') - clock).toBe(SIGNED_URL_TTL_MS)
  })
})

describe('supabase file storage', () => {
  function fakeClient() {
    const objects: string[] = []
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    let registerError: { message: string; status: number } | null = null
    const client: SupabaseStorageLike = {
      storage: {
        from(bucket: string) {
          return {
            async upload(path: string, _body: Blob, options: { contentType?: string; upsert?: boolean }) {
              calls.push({
                fn: 'upload',
                args: { bucket, path, contentType: options.contentType ?? '', upsert: Boolean(options.upsert) },
              })
              objects.push(`${bucket}/${path}`)
              return { error: null }
            },
            async remove(paths: string[]) {
              calls.push({ fn: 'remove', args: { bucket, paths: paths.join(',') } })
              for (const path of paths) {
                const key = `${bucket}/${path}`
                const index = objects.indexOf(key)
                if (index >= 0) objects.splice(index, 1)
              }
              return { error: null }
            },
          }
        },
      },
      async rpc(fn: string, args: Record<string, unknown>) {
        calls.push({ fn, args })
        if (fn === 'register_file' && registerError) return { data: null, error: registerError }
        if (fn === 'register_file') {
          const path = String(args.path)
          const fileName = path.split('/').pop() ?? ''
          return { data: { file_id: fileName.replace(/\.[^.]+$/, '') }, error: null }
        }
        if (fn === 'list_files') {
          return {
            data: {
              files: [
                {
                  file_id: args.file_id ?? 'file-from-server',
                  kind: 'property_image',
                  url: 'https://example.test/signed',
                  expires_at: new Date(Date.now() + SIGNED_URL_TTL_MS).toISOString(),
                },
              ],
            },
            error: null,
          }
        }
        return { data: null, error: { message: 'unknown rpc', status: 404 } }
      },
    }
    return {
      client,
      calls,
      objects,
      failRegister() {
        registerError = { message: 'register failed', status: 500 }
      },
    }
  }

  it('uploads with upsert false, then register_file', async () => {
    const fake = fakeClient()
    const storage = createSupabaseFileStorage(fake.client)
    const result = await storage.upload({ ...target, file: file('cover.jpg', 'image/jpeg') })
    expect(result.path).toMatch(/^ag-1\/property\/unt-1\/.+\.jpg$/)
    expect(result.file_id).toBe(result.path.split('/').pop()?.replace(/\.jpg$/, ''))
    const upload = fake.calls.find((call) => call.fn === 'upload')
    expect(upload?.args).toMatchObject({
      bucket: 'property-media',
      contentType: 'image/jpeg',
      upsert: false,
    })
    const register = fake.calls.find((call) => call.fn === 'register_file')
    expect(register?.args).toMatchObject({
      bucket: 'property-media',
      path: result.path,
      entity_type: 'property',
      entity_id: 'unt-1',
      kind: 'property_image',
    })
    expect(fake.objects).toEqual([`property-media/${result.path}`])
  })

  it('deletes the uploaded object when register_file fails', async () => {
    const fake = fakeClient()
    fake.failRegister()
    const storage = createSupabaseFileStorage(fake.client)
    await expect(storage.upload({ ...target, file: file('cover.jpg', 'image/jpeg') })).rejects.toThrow(
      /register failed/,
    )
    expect(fake.calls.some((call) => call.fn === 'remove')).toBe(true)
    expect(fake.objects).toEqual([])
  })

  it('maps list_files 403 and an empty read to a storage error', async () => {
    const fake = fakeClient()
    const storage = createSupabaseFileStorage({
      ...fake.client,
      async rpc() {
        return { data: null, error: { message: 'forbidden', status: 403 } }
      },
    })
    await expect(storage.listFiles({ entityType: 'property', entityId: 'unt-1' })).rejects.toMatchObject({
      status: 403,
    })

    const empty = createSupabaseFileStorage({
      ...fake.client,
      async rpc() {
        return { data: { files: [] }, error: null }
      },
    })
    await expect(empty.getFile('missing')).rejects.toBeInstanceOf(StorageAccessError)
  })
})
