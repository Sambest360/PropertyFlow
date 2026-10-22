import { describe, expect, it, beforeEach } from 'vitest'
import {
  WORKSPACE_NAV_REFRESH_OPTS,
  workspaceNavRefreshAllowed,
} from './useWorkspaceDataRefresh'
import { markBootstrapFetched, resetBootstrapCoordForTests } from '../lib/bootstrapCoord'

describe('useWorkspaceDataRefresh', () => {
  beforeEach(() => {
    resetBootstrapCoordForTests()
  })

  it('uses non-forced refresh opts', () => {
    expect(WORKSPACE_NAV_REFRESH_OPTS.force).toBe(false)
  })

  it('skips nav refresh when bootstrap was just hydrated for the same user', () => {
    markBootstrapFetched(true, 'agent:u-1')
    expect(workspaceNavRefreshAllowed('u-1', 'u-1')).toBe(false)
  })

  it('allows nav refresh when session user is not hydrated yet', () => {
    markBootstrapFetched(true, 'agent:u-1')
    expect(workspaceNavRefreshAllowed('u-1', null)).toBe(true)
  })
})
