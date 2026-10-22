import { describe, expect, it } from 'vitest'
import { validateApplicationSubmission } from './applicationApi'

describe('validateApplicationSubmission', () => {
  it('allows submit without uploaded_docs URLs', () => {
    const result = validateApplicationSubmission({
      unit: undefined,
      property: {
        id: 'PR-1',
        rent: 12000,
      } as import('../types/domain').PropertyAsset,
      request: {
        unit_id: 'PR-1',
        application_type: 'RENT',
        monthly_income_declared: 45000,
        id_number_or_passport: '8001015800085',
        uploaded_docs: {},
      },
    })
    expect(result).toEqual({ status: 'OK', rentOrPrice: 12000 })
  })
})
