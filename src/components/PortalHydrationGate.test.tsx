import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const auth = { isAuthenticated: true, user: { id: 'u-johan' } }
const store = { hydratedForUserId: null as string | null, hydrationFailed: false, refreshBootstrap: vi.fn() }
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../context/AppStore', () => ({ useStore: () => store }))
vi.mock('../lib/api/config', () => ({ isApiEnabled: true, isSupabaseMode: false }))

import { PortalHydrationGate, PortalLoadError, isPortalHydrating } from './PortalHydrationGate'

describe('OwnerPortal first load (live mode: API)', () => {
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
    expect(isPortalHydrating({ isAuthenticated: false, liveMode: true, userId: 'guest', hydratedForUserId: null })).toBe(false)
    expect(isPortalHydrating({ isAuthenticated: true, liveMode: false, userId: 'u-a', hydratedForUserId: null })).toBe(false)
  })
  it('a failed bootstrap shows an error with retry, not an endless skeleton', () => {
    store.hydratedForUserId = null
    store.hydrationFailed = true
    const html = renderToStaticMarkup(<PortalHydrationGate><i>own</i></PortalHydrationGate>)
    expect(html).toContain('portal-load-error')
    expect(html).toContain('Try again')
    expect(html).not.toContain('portal-skeleton')
    store.hydrationFailed = false
  })
  it('Try again after a failure calls refreshBootstrap(undefined, { force: true })', () => {
    store.hydratedForUserId = null
    store.hydrationFailed = true
    store.refreshBootstrap.mockClear()
    // Render the gate to an element tree (no DOM) and press the retry button.
    const gate = PortalHydrationGate({ children: null }) as { type: unknown; props: { onRetry: () => void } }
    expect(gate.type).toBe(PortalLoadError)
    const panel = PortalLoadError({ onRetry: gate.props.onRetry }) as {
      props: { children: Array<{ type: string; props: { onClick?: () => void } }> }
    }
    const button = panel.props.children.find((c) => c?.type === 'button')!
    button.props.onClick!()
    expect(store.refreshBootstrap).toHaveBeenCalledWith(undefined, { force: true })
    store.hydrationFailed = false
  })
})
