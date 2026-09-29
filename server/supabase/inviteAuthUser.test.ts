import { beforeEach, describe, expect, it, vi } from 'vitest'

const inviteUserByEmail = vi.hoisted(() => vi.fn())
const createAdminClient = vi.hoisted(() =>
  vi.fn(() => ({
    auth: { admin: { inviteUserByEmail } },
  })),
)

vi.mock('./admin.js', () => ({
  createAdminClient,
}))

import { inviteAuthUserByEmail } from './inviteAuthUser.js'

describe('inviteAuthUserByEmail', () => {
  beforeEach(() => {
    inviteUserByEmail.mockReset()
    createAdminClient.mockClear()
    delete process.env.SUPABASE_INVITE_REDIRECT_URL
  })

  it('calls the service-role admin client and returns the auth user id', async () => {
    inviteUserByEmail.mockResolvedValue({
      data: { user: { id: '22222222-2222-4222-8222-222222222222' } },
      error: null,
    })
    const result = await inviteAuthUserByEmail('new.person@example.com')
    expect(createAdminClient).toHaveBeenCalledWith()
    expect(inviteUserByEmail).toHaveBeenCalledWith('new.person@example.com', {})
    expect(result).toEqual({ userId: '22222222-2222-4222-8222-222222222222' })
  })

  it('does not take a caller token or role in the admin call', async () => {
    process.env.SUPABASE_INVITE_REDIRECT_URL = 'http://127.0.0.1:5173/login'
    inviteUserByEmail.mockResolvedValue({
      data: { user: { id: '22222222-2222-4222-8222-222222222223' } },
      error: null,
    })
    await inviteAuthUserByEmail('other@example.com')
    expect(inviteUserByEmail).toHaveBeenCalledWith('other@example.com', {
      redirectTo: 'http://127.0.0.1:5173/login',
    })
    const options = inviteUserByEmail.mock.calls[0]?.[1] as Record<string, unknown>
    expect(options).not.toHaveProperty('data')
    expect(options).not.toHaveProperty('role')
  })
})
