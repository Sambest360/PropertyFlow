import { describe, expect, it } from 'vitest'
import { mergeRedactedApplicationFields } from './writes'
import { lockDocumentReviewFields } from './applicantApplicationPolicy'
import { applicationUploadPayload } from '../src/lib/applicationDocUpload'
import { allDocsUploaded } from '../src/lib/workflow'
import type { Application } from '../src/types/domain'

const file = (n: string) => ({ name: `${n}.pdf`, mimeType: 'application/pdf', dataUrl: `data:application/pdf;base64,${n}`, uploadedAt: 't' })
const stored = [
  { key: 'id', label: 'ID', status: 'uploaded', file: file('id') },
  { key: 'payslip', label: 'Payslip', status: 'uploaded', file: file('payslip') },
  { key: 'bank', label: 'Bank', status: 'uploaded', file: file('bank') },
  { key: 'ref', label: 'Reference', status: 'required' },
]

describe('P3b: one-document save', () => {
  it('applicant policy keeps stored documents missing from a one-document payload; stage can move on the last', () => {
    const out = lockDocumentReviewFields([{ key: 'ref', label: 'Reference', status: 'uploaded', file: file('ref') }], stored) as Array<{
      key: string
      status: string
    }>
    expect(out.map((d) => d.key).sort()).toEqual(['bank', 'id', 'payslip', 'ref'])
    expect(allDocsUploaded(out as never)).toBe(true)
  })

  it('staff upload does not wipe other documents', () => {
    const local = stored.map((d) => (d.key === 'ref' ? { ...d, status: 'uploaded', file: file('ref') } : d))
    const app = { id: 'app-1', applicantUserId: 'u-tenant', documents: local } as unknown as Application
    const payload = applicationUploadPayload(app, 'ref', 'u-staff')
    const { documents } = mergeRedactedApplicationFields(payload, {
      uploaded_docs_json: { documents: stored },
      metadata: {},
    })
    expect((documents as Array<{ key: string; file?: unknown }>).map((d) => d.key)).toEqual(['id', 'payslip', 'bank', 'ref'])
    expect((documents as Array<{ file?: unknown }>).every((d) => d.file)).toBe(true)
  })
})
