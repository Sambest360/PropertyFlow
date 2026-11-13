import { describe, expect, it } from 'vitest'
import { joinParts } from './joinParts'

describe('joinParts', () => {
  it('skips missing parts instead of printing "undefined"', () => {
    expect(joinParts(undefined, 'Lucas Pretorius')).toBe('Lucas Pretorius')
    expect(joinParts('Unit B12', null, '', false, 'High')).toBe('Unit B12 · High')
    expect(joinParts(undefined, null)).toBe('')
  })
  it('keeps numbers, including zero', () => {
    expect(joinParts('Rooms', 0)).toBe('Rooms · 0')
  })
})
