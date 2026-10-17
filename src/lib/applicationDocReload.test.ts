import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Application } from '../types/domain'
import { applicationUploadPayload, applyDocumentUpload } from './applicationDocUpload'
import { lockDocumentReviewFields } from './lockDocumentReviewFields'
import { normalizeApplication, resolveWorkflowStatus } from './applicationWorkflow'
import { readDocumentFile } from './applicationDocDownscale'

const seed = normalizeApplication({
  id: 'app-1',
  type: 'Rental',
  stage: 'Documents Requested',
  workflowStatus: 'documents_requested',
  applicantUserId: 'u-tenant',
  applicantName: 'Thandi',
  documents: [],
  workflowEvents: [],
} as unknown as Application)
const start = { ...seed, documents: seed.documents.map((d) => ({ ...d, status: 'required' as const, file: undefined })) }
const keys = start.documents.map((d) => d.key)

describe('P3b store upload: persists, stage moves and holds after a reload', () => {
  it('4 one-document saves, then a reload from the persisted row', () => {
    expect(resolveWorkflowStatus(start)).toBe('documents_requested')
    let local = start
    let storedDocs: Array<Record<string, unknown>> = []
    let storedRow: Record<string, unknown> = {}
    for (const k of keys) {
      local = applyDocumentUpload(local, k, { name: `${k}.pdf`, mimeType: 'application/pdf', dataUrl: `data:application/pdf;base64,${k}` }, { userId: 'u-tenant', name: 'Thandi' })
      const payload = applicationUploadPayload(local, k, 'u-tenant') as { documents: unknown[] }
      expect(payload.documents).toHaveLength(1)
      // Server (applicant policy) keeps the stored docs missing from the payload.
      storedDocs = lockDocumentReviewFields(payload.documents, storedDocs) as Array<Record<string, unknown>>
      storedRow = { ...payload, documents: storedDocs }
    }
    expect(resolveWorkflowStatus(local)).toBe('documents_uploaded')
    // Simulated reload: a fresh client state built only from the persisted row.
    const reloaded = normalizeApplication(JSON.parse(JSON.stringify(storedRow)) as Application)
    expect(keys.length).toBeGreaterThan(1)
    expect(reloaded.documents.every((d) => d.status === 'uploaded')).toBe(true)
    expect(resolveWorkflowStatus(reloaded)).toBe('documents_uploaded')
  })
})

describe('P3b image downscale (browser-only module)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  // No DOM in this test environment: a minimal FileReader is enough.
  class FakeReader {
    result: string | null = null
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    error = null
    readAsDataURL(f: File) {
      void f.arrayBuffer().then((b) => {
        this.result = `data:${f.type};base64,${Buffer.from(b).toString('base64')}`
        this.onload?.()
      })
    }
  }
  it('PDFs are not resized', async () => {
    vi.stubGlobal('FileReader', FakeReader)
    const f = new File(['%PDF-1.4 hello'], 'bank.pdf', { type: 'application/pdf' })
    const out = await readDocumentFile(f, 2 * 1024 * 1024)
    expect(out.mimeType).toBe('application/pdf')
    expect(out.name).toBe('bank.pdf')
    expect(out.dataUrl.startsWith('data:application/pdf')).toBe(true)
  })
  it('a large PNG goes to a 2000 px long edge as JPEG 0.82', async () => {
    class FakeImage {
      width = 4000
      height = 3000
      onload: (() => void) | null = null
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0)
      }
    }
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('FileReader', FakeReader)
    const calls: Array<{ w: number; h: number; q: unknown }> = []
    vi.stubGlobal('document', {
      createElement: (_tag: string) => {
      const c = { width: 0, height: 0 } as { width: number; height: number; getContext: () => unknown; toDataURL: (t: string, q: unknown) => string }
      c.getContext = () => ({ fillRect() {}, drawImage() {}, fillStyle: '' })
      c.toDataURL = (_t, q) => {
        calls.push({ w: c.width, h: c.height, q })
        return 'data:image/jpeg;base64,' + 'A'.repeat(1000)
      }
      return c
      },
    })
    const f = new File([new Uint8Array(5 * 1024 * 1024)], 'scan.png', { type: 'image/png' })
    const out = await readDocumentFile(f, 2 * 1024 * 1024)
    expect(calls[0]).toEqual({ w: 2000, h: 1500, q: 0.82 })
    expect(out.mimeType).toBe('image/jpeg')
    expect(out.name).toBe('scan.jpg')
    expect(out.bytes).toBeLessThan(2 * 1024 * 1024)
  })
})
