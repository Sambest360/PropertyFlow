import { describe, expect, it } from 'vitest'
import { shouldPurgeGuestOnLoginMount } from './loginMountPurge'

describe('shouldPurgeGuestOnLoginMount', () => {
  it('skips purge while sign-in is in flight', () => {
    expect(
      shouldPurgeGuestOnLoginMount({
        isAuthenticated: false,
        loginInFlight: true,
        bouncedToWorkspace: false,
        authReady: true,
        hasAuthToken: false,
      }),
    ).toBe(false)
  })

  it('purges on bare /login for guests', () => {
    expect(
      shouldPurgeGuestOnLoginMount({
        isAuthenticated: false,
        loginInFlight: false,
        bouncedToWorkspace: false,
        authReady: true,
        hasAuthToken: false,
      }),
    ).toBe(true)
  })
})
