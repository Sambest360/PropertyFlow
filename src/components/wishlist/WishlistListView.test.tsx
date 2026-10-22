import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Application, PropertyAsset } from '../../types/domain'

const property: PropertyAsset = {
  id: 'PR-1011',
  agencyId: 'ag-1',
  agentId: 'u-agent',
  title: 'Test flat',
  address: '1 Main',
  suburb: 'Suburb',
  city: 'City',
  description: 'Nice place',
  type: 'Apartment',
  listingMode: 'rent',
  status: 'Listed',
  beds: 2,
  baths: 1,
  parking: 1,
  area: 50,
  rent: 10000,
  price: null,
  images: ['https://example.com/1.jpg'],
  amenities: [],
  rooms: [],
  unitId: 'unt-1',
}

const store = {
  state: {
    applications: [] as Application[],
    units: [],
  },
}

const auth = {
  user: { id: 'u-tenant', email: 'sam@example.com' },
  isAuthenticated: true,
}

vi.mock('../../context/AppStore', () => ({
  useStore: () => store,
}))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../hooks/useWishlist', () => ({
  useWishlist: () => ({ toggle: vi.fn() }),
}))
vi.mock('../../hooks/useScrollMotion', () => ({ usePrefersReducedMotion: () => true }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
      <a href={to}>{children}</a>
    ),
  }
})

import { WishlistListView } from './WishlistListView'

describe('WishlistListView Apply links', () => {
  it('links Apply to listing with apply=1 when no application exists', () => {
    store.state.applications = []
    const html = renderToStaticMarkup(
      <WishlistListView
        properties={[property]}
        expandedId="PR-1011"
        onToggle={() => {}}
        reducedMotion
      />,
    )
    expect(html).toContain('href="/listing/PR-1011?apply=1"')
    expect(html).toContain('Apply')
  })

  it('links Continue application to tenant application detail when one exists', () => {
    store.state.applications = [
      {
        id: 'APP-42',
        agencyId: 'ag-1',
        propertyId: 'PR-1011',
        unitId: null,
        agentId: null,
        applicantUserId: 'u-tenant',
        applicantName: 'Sam',
        email: 'sam@example.com',
        phone: '',
        type: 'Rental',
        workflowStatus: 'application_submitted',
        stage: 'Application submitted',
        progress: 0,
        income: 0,
        employment: '',
        documents: [],
        docs: [],
        creditCheck: 'Not Started',
        creditConsent: false,
        viewingSlotId: null,
        notes: '',
        submittedAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ]
    const html = renderToStaticMarkup(
      <WishlistListView
        properties={[property]}
        expandedId="PR-1011"
        onToggle={() => {}}
        reducedMotion
      />,
    )
    expect(html).toContain('href="/workspace/portals/tenant/applications/APP-42"')
    expect(html).toContain('Continue application')
  })
})
