import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const store = {
  state: { applications: [] },
  hydratedForUserId: null as string | null,
}
const auth = {
  user: { id: 'u-1', role: 'tenant' as const },
  authReady: true,
}
const wishlist = { ids: ['PR-1011'] as string[] }

vi.mock('../../context/AppStore', () => ({
  usePublicProperties: () => [],
  useStore: () => store,
}))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../hooks/useWishlist', () => ({ useWishlist: () => wishlist }))
vi.mock('../../hooks/useScrollMotion', () => ({ usePrefersReducedMotion: () => true }))
vi.mock('../../components/wishlist/WishlistListView', () => ({
  WishlistListView: () => <div data-testid="wishlist-list" />,
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }
})

import AccountWishlistPage from './AccountWishlistPage'

describe('AccountWishlistPage (FW-44)', () => {
  it('shows loading copy while hydrate pending and ids exist', () => {
    store.hydratedForUserId = null
    const html = renderToStaticMarkup(<AccountWishlistPage />)
    expect(html).toContain('Loading your saved homes')
    expect(html).not.toContain('No saved homes yet')
  })

  it('shows empty copy when hydrated and no matches', () => {
    store.hydratedForUserId = 'u-1'
    const html = renderToStaticMarkup(<AccountWishlistPage />)
    expect(html).toContain('No saved homes yet')
  })
})
