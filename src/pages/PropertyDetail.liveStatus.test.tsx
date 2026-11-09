/**
 * P4: on a live listing, only the owner sees Feature, Delete, Take down and
 * the occupied-advert card. Setup copied from PropertyDetail.scope.test.tsx.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import PropertyDetail from './PropertyDetail'

vi.mock('../components/alerts/SuiteAlert', () => ({ useSuiteAlert: () => ({ success: vi.fn() }) }))

vi.mock('../components/PropertyMap', () => ({ PropertyMap: () => null, PropertyMapPlaceholder: () => null }))
vi.mock('../components/property-detail/PropertyMapPanel', () => ({ PropertyMapPanel: () => null }))
vi.mock('../components/property-detail/OccupiedAdvertCard', () => ({ OccupiedAdvertCard: () => <div>OCCUPIED-ADVERT-CARD</div> }))

// Module-level control variables
let mockUser: { id: string; name: string; role: string; agencyId: string | null; platformTier?: string } = {
  id: 'u-viewer',
  name: 'Viewer',
  role: 'ground_agent',
  agencyId: 'ag-a',
}
let mockHas = (_permission: string) => true
let mockAgencyId = 'ag-a'
let mockParamsId = 'p-own'
let mockProperties: any[] = []
let mockUnits: any[] = []

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    has: mockHas,
    agencyId: mockAgencyId,
  }),
  usePropertyScope: () => ({
    inPropertyScope: (id: string) => {
      const prop = mockProperties.find((p) => p.id === id)
      if (!prop) return false
      if (prop.agencyId !== mockAgencyId) return false
      if (mockUser.role === 'ground_agent' || mockUser.role === 'agent') {
        return prop.agentId === mockUser.id
      }
      return true
    },
  }),
}))

vi.mock('../context/AppStore', () => ({
  useStore: () => ({
    state: {
      properties: mockProperties,
      units: mockUnits,
      buildings: [],
      infraRooms: [],
      internalAssets: [],
      applications: [],
      tickets: [],
      viewings: [],
      viewingSlots: [],
      payments: [],
      propertyDocuments: [],
      threads: [],
      messages: [],
      notifications: [],
      suiteAlerts: [],
      activities: [],
      propertyEvents: [],
      invoices: [],
      lookups: [],
      trustTransactions: [],
      trustAllocations: [],
      payoutInstructions: [],
      depositHoldings: [],
      arrearsSnapshots: [],
      csvImportBatches: [],
      agencyContractors: [],
      users: [],
      tenancies: [],
    },
    updateProperty: vi.fn(),
    publishProperty: vi.fn(),
    deleteProperty: vi.fn(),
    restoreProperty: vi.fn(),
    updateInternalAsset: vi.fn(),
    addInternalAsset: vi.fn(),
    removeInternalAsset: vi.fn(),
    updateInfraRoom: vi.fn(),
    addInfraRoom: vi.fn(),
    removeInfraRoom: vi.fn(),
    patchMaintenanceTicket: vi.fn(),
    updateTicket: vi.fn(),
    removeTicket: vi.fn(),
    approveApplication: vi.fn(),
    advanceApplicationWorkflow: vi.fn(),
    updateApplication: vi.fn(),
    blockApplication: vi.fn(),
    setDocumentStatus: vi.fn(),
    updateViewing: vi.fn(),
    createViewingSlot: vi.fn(),
    updateViewingSlot: vi.fn(),
    removeViewingSlot: vi.fn(),
    transferViewingSlot: vi.fn(),
    createPayment: vi.fn(),
    createThread: vi.fn(),
    sendMessage: vi.fn(),
    addPropertyEvent: vi.fn(),
    addPropertyDocument: vi.fn(),
    notify: vi.fn(),
    refreshSessionData: vi.fn(),
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: mockParamsId }),
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  }
})

describe('PropertyDetail: live-status controls are the owner\'s (P4)', () => {
  const base = {
    id: 'p-live', agencyId: 'ag-a', landlordId: 'u-ll', agentId: 'u-viewer', unitId: 'unt-live', title: 'Live Flat', type: 'Apartment',
    listingMode: 'rent', price: null, rent: 1000, beds: 2, baths: 1, parking: 1, area: 80, city: 'C', suburb: 'S', address: '1 Live St',
    lat: 0, lng: 0, images: ['/api/files/x.jpg'], rooms: [], amenities: [], description: '', featured: false, createdAt: '2026-01-01',
  }
  const advertProp = { ...base, status: 'Rented', advertiseWhileOccupied: true, availableFrom: '2030-01-01' }
  const advertUnit = { id: 'unt-live', statusKey: 'OCCUPIED', listingType: 'RENT', unitNumber: '1' }
  const render = () => renderToStaticMarkup(<MemoryRouter><PropertyDetail /></MemoryRouter>)
  const controls = (html: string) => ({
    feature: />(Un)?[Ff]eature</.test(html),
    del: />Delete</.test(html),
    takeDown: html.includes('Take down'),
    advert: html.includes('OCCUPIED-ADVERT-CARD'),
  })
  const as = (u: typeof mockUser) => {
    mockUser = u
    mockAgencyId = 'ag-a'
    mockParamsId = 'p-live'
    mockProperties = [advertProp]
    mockUnits = [advertUnit]
  }

  it('agent_admin and an Administrator see none of the four on a live listing', () => {
    as({ id: 'u-viewer', name: 'A', role: 'agent_admin', agencyId: 'ag-a' })
    const agency = controls(render())
    as({ id: 'u-adm', name: 'Adm', role: 'super_admin', agencyId: null, platformTier: 'administrator' })
    const administrator = controls(render())
    const none = { feature: false, del: false, takeDown: false, advert: false }
    expect({ agency, administrator }).toEqual({ agency: none, administrator: none })
  })

  it('the owner sees all four', () => {
    as({ id: 'u-owner', name: 'Owner', role: 'super_admin', agencyId: null })
    expect(controls(render())).toEqual({ feature: true, del: true, takeDown: true, advert: true })
  })

  it("agent_admin on a draft still gets 'Make live'", () => {
    as({ id: 'u-viewer', name: 'A', role: 'agent_admin', agencyId: 'ag-a' })
    mockProperties = [{ ...base, status: 'Draft' }]
    mockUnits = [{ ...advertUnit, statusKey: 'DRAFT' }]
    expect(render()).toContain('Make live')
  })
})
