import { describe, expect, it } from 'vitest'
import { assertUnitFloorSize } from './unitFloorSize.js'

/**
 * T2 V2-1: the server floor check uses the same rule as erf and the wizard
 * (plain decimals, 0 … 99 999 999.99). Before, it used Number(): '0x10' was
 * stored as 16, '1e3' as 1000, '-1' as a negative floor, '12,5' as NULL.
 */
const rejects = (d: Record<string, unknown>) =>
  expect(() => assertUnitFloorSize(d)).toThrow(expect.objectContaining({ status: 400, code: 'UNIT_FLOOR_SIZE_INVALID' }))
const accepts = (d: Record<string, unknown>) => expect(() => assertUnitFloorSize(d)).not.toThrow()

const BAD = ['0x10', '1e3', '+5', '-1', '-0', '12,5', 'NaN', 'Infinity', '12 m²', '١٢']

describe('assertUnitFloorSize (V2-1)', () => {
  it.each(BAD)('400 for the area string %j', (v) => rejects({ area: v }))

  it.each(BAD)('400 for the squareMeters string %j when area is not set', (v) => rejects({ squareMeters: v }))

  it('400 for a negative number', () => {
    rejects({ area: -1 })
    rejects({ squareMeters: -0.01 })
  })

  it('400 for a value that is not a number, numeric string, null or blank', () => {
    for (const v of [true, false, {}, [], [250]]) rejects({ area: v })
  })

  it('400 above the floor maximum', () => {
    rejects({ area: 100_000_000 })
    rejects({ area: '99999999.994' })
  })

  it('accepts plain decimals from 0 to the maximum, and blank', () => {
    for (const v of [0, 250, 99_999_999.99, '250', '250.5', ' 12 ', '.5', '5.', '99999999.99']) accepts({ area: v })
    for (const v of [undefined, null, '', '   ']) accepts({ area: v, squareMeters: v })
  })

  it('checks the value that is stored: area when set, else squareMeters', () => {
    accepts({ area: 250, squareMeters: '0x10' })
    rejects({ area: '', squareMeters: '0x10' })
    rejects({ area: null, squareMeters: '-1' })
  })
})
