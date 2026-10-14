import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACTOR_USER_HEADER, actorHeaders, setApiActor } from './actorAuth'

describe('actorHeaders (production)', () => {
  afterEach(() => {
    setApiActor(null)
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns no spoofable headers when a JWT is stored in PROD', () => {
    vi.stubEnv('PROD', true)
    const ls = { getItem: vi.fn(() => 'jwt-token'), setItem: vi.fn(), removeItem: vi.fn() }
    vi.stubGlobal('localStorage', ls)
    setApiActor({ userId: 'u-staff', role: 'agency_admin', agencyId: 'ag-1' })
    const headers = actorHeaders()
    expect(headers).toEqual({})
    expect(ls.getItem).toHaveBeenCalledWith('propertyflow-auth-token')
  })

  it('includes demo actor headers outside PROD', () => {
    vi.stubEnv('PROD', false)
    setApiActor({ userId: 'u-demo', role: 'tenant', agencyId: null })
    expect(actorHeaders()[ACTOR_USER_HEADER]).toBe('u-demo')
  })
})
