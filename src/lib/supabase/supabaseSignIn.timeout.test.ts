import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SUPABASE_SIGN_IN_TIMEOUT_MS,
  signInWithPasswordWithTimeout,
  supabaseSignIn,
} from './auth'

const signInWithPassword = vi.fn()

vi.mock('../../utils/supabase/client', () => ({
  createClient: () => ({
    auth: { signInWithPassword },
  }),
}))

vi.mock('./idMap.js', () => ({ EMAIL_TO_USER: {}, resolveFrontendRole: () => 'tenant' }))

describe('signInWithPasswordWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    signInWithPassword.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects with Connection timed out (auth) when sign-in hangs', async () => {
    signInWithPassword.mockImplementation(
      () => new Promise(() => {}),
    )
    const supabase = { auth: { signInWithPassword } } as ReturnType<
      typeof import('../../utils/supabase/client').createClient
    >
    const p = signInWithPasswordWithTimeout(supabase, 'a@b.com', 'pw', 5_000)
    const assertion = expect(p).rejects.toThrow('Connection timed out (auth)')
    await vi.advanceTimersByTimeAsync(5_000)
    await assertion
  })

  it('supabaseSignIn surfaces timeout through the same message', async () => {
    signInWithPassword.mockImplementation(() => new Promise(() => {}))
    const p = supabaseSignIn('a@b.com', 'pw')
    const assertion = expect(p).rejects.toThrow('Connection timed out (auth)')
    await vi.advanceTimersByTimeAsync(SUPABASE_SIGN_IN_TIMEOUT_MS)
    await assertion
  })
})
