import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const auth = {
  has: vi.fn(() => true),
  hasAny: vi.fn(() => true),
  authReady: true,
  loginInFlight: false,
  isAuthenticated: true,
}

vi.mock('../context/AuthContext', () => ({
  useAuth: () => auth,
}))

vi.mock('../lib/api/authClient', () => ({
  readAuthToken: vi.fn(() => null as string | null),
}))

vi.mock('../lib/api/actorAuth', () => ({
  readStoredAuthUserId: vi.fn(() => null as string | null),
}))

import { readAuthToken } from '../lib/api/authClient'
import { readStoredAuthUserId } from '../lib/api/actorAuth'
import { RequirePermission } from './RequirePermission'

describe('RequirePermission', () => {
  beforeEach(() => {
    auth.authReady = true
    auth.loginInFlight = false
    auth.isAuthenticated = true
    auth.has.mockReturnValue(true)
    vi.mocked(readAuthToken).mockReturnValue(null)
    vi.mocked(readStoredAuthUserId).mockReturnValue(null)
  })

  it('shows loader while auth is not ready with a pending token', () => {
    auth.authReady = false
    vi.mocked(readAuthToken).mockReturnValue('jwt')
    const html = renderToStaticMarkup(
      <RequirePermission permission="portal.tenant">
        <span>child</span>
      </RequirePermission>,
    )
    expect(html).toContain('Loading')
    expect(html).not.toContain('child')
  })

  it('redirects only when auth is ready and permission denied', () => {
    auth.authReady = true
    auth.has.mockReturnValue(false)
    const html = renderToStaticMarkup(
      <RequirePermission permission="portal.tenant" fallback={<span data-testid="denied">denied</span>}>
        <span>child</span>
      </RequirePermission>,
    )
    expect(html).toContain('denied')
    expect(html).not.toContain('child')
  })

  it('renders children when ready and allowed', () => {
    const html = renderToStaticMarkup(
      <RequirePermission permission="portal.tenant">
        <span>allowed</span>
      </RequirePermission>,
    )
    expect(html).toContain('allowed')
  })
})
