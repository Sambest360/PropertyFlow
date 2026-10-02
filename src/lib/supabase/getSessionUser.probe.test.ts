import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLoginInFlight } from '../auth/sessionArtifacts'
import { supabaseGetSessionUser } from './auth'

const harness = vi.hoisted(() => {
  const signOut = vi.fn(async () => ({}))
  return {
    snapshotId: 'pre-login' as string | null,
    liveId: 'pre-login' as string | null,
    verifiedId: null as string | null,
    verifyError: { message: 'miss' } as { message: string } | null,
    signOut,
  }
})

vi.mock('../../utils/supabase/client', () => ({
  createClient: () => {
    let reads = 0
    return {
      auth: {
        getSession: async () => {
          reads += 1
          const id = reads === 1 ? harness.snapshotId : harness.liveId
          return { data: { session: id ? { user: { id } } : null } }
        },
        getUser: async () => ({
          data: { user: harness.verifiedId ? { id: harness.verifiedId } : null },
          error: harness.verifyError,
        }),
        signOut: harness.signOut,
      },
    }
  },
}))

describe('supabaseGetSessionUser remint60 probe hole', () => {
  beforeEach(() => {
    harness.snapshotId = 'pre-login'
    harness.liveId = 'pre-login'
    harness.verifiedId = null
    harness.verifyError = { message: 'miss' }
    harness.signOut.mockClear()
    setLoginInFlight(false)
  })

  afterEach(() => {
    setLoginInFlight(false)
  })

  it('does not full signOut while login is in flight', async () => {
    setLoginInFlight(true)
    await expect(supabaseGetSessionUser()).resolves.toBeNull()
    expect(harness.signOut).not.toHaveBeenCalled()
  })

  it('does not full signOut when sign-in replaced the snapshot user', async () => {
    harness.liveId = 'sipho'
    harness.verifiedId = 'sipho'
    harness.verifyError = null
    await expect(supabaseGetSessionUser()).resolves.toBeNull()
    expect(harness.signOut).not.toHaveBeenCalled()
  })

  it('still full signOut when the live id is still the dead snapshot', async () => {
    await expect(supabaseGetSessionUser()).resolves.toBeNull()
    expect(harness.signOut).toHaveBeenCalledTimes(1)
  })
})
