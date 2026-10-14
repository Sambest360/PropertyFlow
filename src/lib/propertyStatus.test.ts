import { describe, expect, it } from 'vitest'
import { resolvePortfolioStatus } from './propertyStatus'

describe('resolvePortfolioStatus (dashboard vs detail parity)', () => {
  it('maps Published + PUBLISHED unit to Available', () => {
    expect(resolvePortfolioStatus('Published', 'PUBLISHED')).toEqual({
      label: 'Available',
      tone: 'success',
    })
  })

  it('maps Published + VACANT unit to Available', () => {
    expect(resolvePortfolioStatus('Published', 'VACANT')).toEqual({
      label: 'Available',
      tone: 'success',
    })
  })
})
