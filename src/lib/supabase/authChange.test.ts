import { describe, expect, it, vi } from 'vitest'
import { resolveAuthChangeDecision } from './authChange'

describe('resolveAuthChangeDecision (P0 empty-DB SA session)', () => {
  it('signed_out when session is missing', async () => {
    const decision = await resolveAuthChangeDecision({
      sessionUserId: null,
      verifyUser: async () => ({ id: 'u1' }),
      loadProfile: async () => ({ id: 'p1' }),
    })
    expect(decision.action).toBe('signed_out')
  })

  it('signed_out when verify uid mismatches cached session', async () => {
    const decision = await resolveAuthChangeDecision({
      sessionUserId: 'auth-a',
      verifyUser: async () => ({ id: 'auth-b' }),
      loadProfile: async () => ({ id: 'p1' }),
    })
    expect(decision.action).toBe('signed_out')
  })

  it('signed_out when verify returns null (dead JWT)', async () => {
    const decision = await resolveAuthChangeDecision({
      sessionUserId: 'auth-a',
      verifyUser: async () => null,
      loadProfile: async () => ({ id: 'p1' }),
    })
    expect(decision.action).toBe('signed_out')
  })

  it('apply when profile loads on first try', async () => {
    const profile = { id: 'fe-sa', role: 'super_admin' }
    const decision = await resolveAuthChangeDecision({
      sessionUserId: 'auth-a',
      verifyUser: async () => ({ id: 'auth-a' }),
      loadProfile: async () => profile,
    })
    expect(decision).toEqual({ action: 'apply', profile })
  })

  it('keep when live session but profile missing after retry (empty-DB race)', async () => {
    const loadProfile = vi.fn().mockResolvedValue(null)
    const decision = await resolveAuthChangeDecision({
      sessionUserId: 'auth-a',
      verifyUser: async () => ({ id: 'auth-a' }),
      loadProfile,
      retryDelayMs: 1,
    })
    expect(decision.action).toBe('keep')
    expect(loadProfile).toHaveBeenCalledTimes(2)
  })

  it('apply when profile appears on retry', async () => {
    const profile = { id: 'fe-sa', role: 'super_admin' }
    const loadProfile = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(profile)
    const decision = await resolveAuthChangeDecision({
      sessionUserId: 'auth-a',
      verifyUser: async () => ({ id: 'auth-a' }),
      loadProfile,
      retryDelayMs: 1,
    })
    expect(decision).toEqual({ action: 'apply', profile })
  })

  it('keep when verify throws (transient) with live session', async () => {
    const decision = await resolveAuthChangeDecision({
      sessionUserId: 'auth-a',
      verifyUser: async () => {
        throw new Error('lock / network')
      },
      loadProfile: async () => ({ id: 'p1' }),
    })
    expect(decision.action).toBe('keep')
  })
})
