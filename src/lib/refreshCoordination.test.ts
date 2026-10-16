import { describe, expect, it } from 'vitest'
import { nextRefreshRequestId, shouldApplyRefreshResult } from './refreshCoordination'

describe('refreshCoordination', () => {
  it('shouldApplyRefreshResult is true only for the latest id', () => {
    expect(shouldApplyRefreshResult(1, 2)).toBe(false)
    expect(shouldApplyRefreshResult(2, 2)).toBe(true)
  })

  it('nextRefreshRequestId increments', () => {
    const counter = { current: 0 }
    expect(nextRefreshRequestId(counter)).toBe(1)
    expect(nextRefreshRequestId(counter)).toBe(2)
  })
})
