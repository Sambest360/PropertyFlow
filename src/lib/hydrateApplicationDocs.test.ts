import { describe, expect, it } from 'vitest'
import { hydrateDocumentsFromUploadedJson, parseUploadedDocsJson } from './hydrateApplicationDocs'

describe('hydrateApplicationDocs (P0 Approve→occupancy)', () => {
  it('invalid JSON → blank checklist, never invent verified', () => {
    const { documents, creditCheck } = hydrateDocumentsFromUploadedJson('Rental', '{not-json')
    expect(documents.length).toBeGreaterThan(0)
    expect(documents.every((d) => d.status === 'required')).toBe(true)
    expect(creditCheck).toBeUndefined()
  })

  it('hydrates verified statuses from uploaded_docs_json', () => {
    const payload = {
      documents: [
        { key: 'id', label: 'ID', status: 'verified' },
        { key: 'address', label: 'Address', status: 'verified' },
      ],
      creditCheck: 'In Progress',
      creditConsent: true,
    }
    const { documents, creditCheck, creditConsent } = hydrateDocumentsFromUploadedJson(
      'Rental',
      payload,
    )
    const id = documents.find((d) => d.key === 'id')
    expect(id?.status).toBe('verified')
    expect(creditCheck).toBe('In Progress')
    expect(creditConsent).toBe(true)
    // Template keys still present
    expect(documents.length).toBeGreaterThan(2)
  })

  it('parseUploadedDocsJson accepts string or object', () => {
    expect(parseUploadedDocsJson(null)).toBeNull()
    expect(parseUploadedDocsJson('{"documents":[]}')).toEqual({ documents: [] })
    expect(parseUploadedDocsJson({ documents: [] })).toEqual({ documents: [] })
  })
})
