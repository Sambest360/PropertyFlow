import { describe, expect, it } from 'vitest'
import { findJwtHits, scanTrackedFilesForJwts } from './noCommittedJwt.ts'

describe('committed JWT scan', () => {
  it('flags a JWT built from fake segments and ignores ordinary text', () => {
    const sample = ['ey' + 'Jheader', 'ey' + 'Jpayload', 'not-a-signature'].join('.')
    expect(findJwtHits(sample)).toHaveLength(1)
    expect(findJwtHits('hello example.test')).toEqual([])
    expect(sample.startsWith('ey' + 'J')).toBe(true)
  })

  it('fails if a tracked file other than a lockfile contains a JWT', () => {
    expect(scanTrackedFilesForJwts()).toEqual([])
  })
})
