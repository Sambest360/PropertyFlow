import { describe, expect, it } from 'vitest'
import {
  REGISTRATION_DOC_MAX_BYTES,
  formatDocSizeLabel,
  validateRegistrationDocSizes,
} from './registrationDocs'

describe('registration document cap', () => {
  it('is 800 KB per document', () => {
    expect(REGISTRATION_DOC_MAX_BYTES).toBe(800 * 1024)
    expect(formatDocSizeLabel()).toBe('800 KB')
  })

  it('returns a file-too-large message instead of failing silently', () => {
    const tooBig = 'x'.repeat(REGISTRATION_DOC_MAX_BYTES * 2)
    const message = validateRegistrationDocSizes([{ label: 'ID document', dataUrl: tooBig }])
    expect(message).toMatch(/file too large/i)
    expect(message).toMatch(/800 KB/)
  })
})