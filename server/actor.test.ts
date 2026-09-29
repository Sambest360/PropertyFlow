import { describe, expect, it } from 'vitest'
import { resolveDemoActor, sessionActorDecision } from './actor'

describe('resolveDemoActor', () => {
  it('rejects incomplete identity', () => {
    expect(resolveDemoActor({ userId: 'u-1' })).toBeNull()
    expect(resolveDemoActor({ role: 'client_admin' })).toBeNull()
    expect(resolveDemoActor({ userId: 'u-1', role: 'not_a_role' })).toBeNull()
  })

  it('accepts a known role and strips null agency sentinel', () => {
    expect(
      resolveDemoActor({
        userId: ' u-amelia ',
        role: 'client_admin',
        agencyId: 'null',
      }),
    ).toEqual({
      userId: 'u-amelia',
      role: 'client_admin',
      agencyId: null,
    })
  })

  it('ignores a forged role when the claimed user is the session user', () => {
    expect(
      sessionActorDecision('u-tenant', {
        userId: 'u-tenant',
        role: 'super_admin',
        agencyId: 'ag-other',
      }),
    ).toEqual({ kind: 'self' })
  })

  it('treats a different user id as an impersonation request', () => {
    expect(
      sessionActorDecision('u-admin', {
        userId: 'u-tenant',
        role: 'super_admin',
        agencyId: null,
      }),
    ).toEqual({ kind: 'impersonate', targetUserId: 'u-tenant' })
  })

  it('keeps a real agency id', () => {
    expect(
      resolveDemoActor({
        userId: 'u-amelia',
        role: 'client_admin',
        agencyId: 'ag-horizon',
      }),
    ).toEqual({
      userId: 'u-amelia',
      role: 'client_admin',
      agencyId: 'ag-horizon',
    })
  })
})
