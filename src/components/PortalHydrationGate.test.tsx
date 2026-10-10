import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const auth = { isAuthenticated: true, user: { id: 'u-johan' } }
const store = { hydratedForUserId: null as string | null }
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../context/AppStore', () => ({ useStore: () => store }))
vi.mock('../lib/api/config', () => ({ isApiEnabled: true, isSupabaseMode: false }))

import { PortalHydrationGate, isPortalHydrating } from './PortalHydrationGate'

describe('OwnerPortal first load (API mode)', () => {
  it('before hydration shows the skeleton, not "No properties yet" or cached rows', () => {
    store.hydratedForUserId = null
    const html = renderToStaticMarkup(
      <PortalHydrationGate>
        <div>No properties yet</div>
        <div>p-cached-row</div>
      </PortalHydrationGate>,
    )
    expect(html).toContain('portal-skeleton')
    expect(html).not.toContain('No properties yet')
    expect(html).not.toContain('p-cached-row')
  })

  it("a bootstrap for another user still shows the skeleton; the user's own shows the portal", () => {
    store.hydratedForUserId = 'u-previous'
    expect(renderToStaticMarkup(<PortalHydrationGate><i>own</i></PortalHydrationGate>)).toContain('portal-skeleton')
    store.hydratedForUserId = 'u-johan'
    const html = renderToStaticMarkup(<PortalHydrationGate><i>own</i></PortalHydrationGate>)
    expect(html).toContain('own')
    expect(html).not.toContain('portal-skeleton')
  })

  it('no skeleton for guests or demo mode', () => {
    expect(isPortalHydrating({ isAuthenticated: false, apiMode: true, userId: 'guest', hydratedForUserId: null })).toBe(false)
    expect(isPortalHydrating({ isAuthenticated: true, apiMode: false, userId: 'u-a', hydratedForUserId: null })).toBe(false)
  })
})
