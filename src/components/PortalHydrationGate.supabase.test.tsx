import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const store = { hydratedForUserId: null as string | null, hydrationFailed: false, refreshBootstrap: vi.fn() }
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, user: { id: 'u-johan' } }) }))
vi.mock('../context/AppStore', () => ({ useStore: () => store }))
vi.mock('../lib/api/config', () => ({ isApiEnabled: false, isSupabaseMode: true }))

import { PortalHydrationGate } from './PortalHydrationGate'
import { readOwnedClientCache, serializeClientCache } from '../lib/clientCache'

describe('Supabase mode', () => {
  it('portal shows the skeleton until the user\'s own bootstrap lands', () => {
    expect(renderToStaticMarkup(<PortalHydrationGate><i>own</i></PortalHydrationGate>)).toContain('portal-skeleton')
    store.hydratedForUserId = 'u-johan'
    expect(renderToStaticMarkup(<PortalHydrationGate><i>own</i></PortalHydrationGate>)).toContain('own')
  })

  it('serializeClientCache in live (Supabase) mode drops PII/trust books and tags the owner', () => {
    const raw = serializeClientCache({ properties: [1], users: [1], depositHoldings: [1] }, 'u-johan', true)
    expect(readOwnedClientCache<Record<string, unknown>>(raw, 'u-johan')).toEqual({})
  })
})
