import { describe, expect, it } from 'vitest'
import type { Application } from '../types/domain'
import {
  APPLICATION_DOC_MAX_BYTES,
  APPLICATION_DOC_TOO_LARGE,
  APPLICATION_DOC_WRONG_TYPE,
  applicationDocFileError,
  applicationUploadPayload,
} from './applicationDocUpload'

const MB = 1024 * 1024
const doc = (key: string, status = 'uploaded') => ({ key, label: key, status, file: { name: `${key}.pdf`, dataUrl: 'data:x'.repeat(10) } })
const app = {
  id: 'app-1',
  applicantUserId: 'u-tenant',
  documents: [doc('id'), doc('payslip'), doc('bank'), doc('ref')],
} as unknown as Application

describe('application document upload (P3b)', () => {
  it('refuses files over 2 MB with the agreed copy', () => {
    expect(APPLICATION_DOC_MAX_BYTES).toBe(2 * 1024 * 1024)
    expect(applicationDocFileError({ size: 2 * MB + 1, type: 'application/pdf' })).toBe(APPLICATION_DOC_TOO_LARGE)
    expect(APPLICATION_DOC_TOO_LARGE).toBe(
      'This file is larger than 2 MB. Upload a smaller copy.',
    )
  })
  it('accepts PDF, JPEG, PNG up to the cap; refuses other types', () => {
    expect(applicationDocFileError({ size: 1.5 * MB, type: 'application/pdf' })).toBeNull()
    expect(applicationDocFileError({ size: 1.5 * MB, type: 'image/jpeg' })).toBeNull()
    expect(applicationDocFileError({ size: 2 * MB, type: 'image/png' })).toBeNull()
    expect(applicationDocFileError({ size: 10, type: 'image/webp' })).toBe(APPLICATION_DOC_WRONG_TYPE)
    expect(applicationDocFileError({ size: 10, type: '', name: 'scan.PDF' })).toBeNull()
  })
  it('applicant upload sends only the changed document', () => {
    const p = applicationUploadPayload(app, 'bank', 'u-tenant') as { documents: Array<{ key: string }> }
    expect(p.documents.map((d) => d.key)).toEqual(['bank'])
  })
  it('4 uploads of 1.5 MB each: every applicant request carries one file', () => {
    const big = { ...app, documents: app.documents.map((d) => ({ ...d, file: { ...d.file, dataUrl: 'x'.repeat(2 * MB) } })) } as unknown as Application
    for (const k of ['id', 'payslip', 'bank', 'ref']) {
      const size = JSON.stringify(applicationUploadPayload(big, k, 'u-tenant')).length
      expect(size).toBeLessThan(2.2 * MB)
    }
  })
  it('staff upload keeps sending the full list (staff writer replaces it whole)', () => {
    const p = applicationUploadPayload(app, 'bank', 'u-staff') as { documents: unknown[] }
    expect(p.documents).toHaveLength(4)
    expect(applicationUploadPayload(app, 'bank', undefined)).toBe(app)
  })
})
