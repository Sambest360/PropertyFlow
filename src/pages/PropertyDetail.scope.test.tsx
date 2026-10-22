import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import PropertyDetail from './PropertyDetail'

vi.mock('../components/alerts/SuiteAlert', () => ({ useSuiteAlert: () => ({ success: vi.fn() }) }))

vi.mock('../components/PropertyMap', () => ({ PropertyMap: () => null, PropertyMapPlaceholder: () => null }))
vi.mock('../components/property-detail/PropertyMapPanel', () => ({ PropertyMapPanel: () => null }))

// Module-level control variables
let mockUser: { id: string; name: string; role: string; agencyId: string } = {
  id: 'u-viewer',
  name: 'Viewer',
  role: 'ground_agent',
  agencyId: 'ag-a',
}
let mockHas = (_permission: string) => true
let mockAgencyId = 'ag-a'
let mockParamsId = 'p-own'
let mockProperties: any[] = []

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
      units: [],
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

describe('PropertyDetail scope-based access', () => {
  const baseProperty = {
    id: 'p-own',
    agencyId: 'ag-a',
    landlordId: 'u-ll',
    title: 'Test Property',
    type: 'House',
    status: 'Published',
    listingMode: 'rent',
    price: null,
    rent: 1000,
    beds: 2,
    baths: 1,
    parking: 1,
    area: 80,
    city: 'Test City',
    suburb: 'Test Suburb',
    address: '1 Test Street',
    lat: 0,
    lng: 0,
    images: [],
    rooms: [],
    amenities: [],
    description: '',
    featured: false,
    createdAt: '2026-01-01',
  }

  it('ground_agent sees own property details', () => {
    mockUser = { id: 'u-viewer', name: 'Viewer', role: 'ground_agent', agencyId: 'ag-a' }
    mockAgencyId = 'ag-a'
    mockParamsId = 'p-own'
    mockProperties = [{ ...baseProperty, agentId: 'u-viewer' }]

    const html = renderToStaticMarkup(<MemoryRouter><PropertyDetail /></MemoryRouter>)
    expect(html).toContain('Test Property')
    expect(html).not.toContain('Property not found')
  })

  it('ground_agent sees "Property not found" for another agent\'s property and does NOT redirect', () => {
    mockUser = { id: 'u-viewer', name: 'Viewer', role: 'ground_agent', agencyId: 'ag-a' }
    mockAgencyId = 'ag-a'
    mockParamsId = 'p-other-agent'
    mockProperties = [{ ...baseProperty, id: 'p-other-agent', agentId: 'u-other-agent' }]

    const html = renderToStaticMarkup(<MemoryRouter><PropertyDetail /></MemoryRouter>)
    expect(html).toContain('Property not found')
    expect(html).not.toContain('Test Property')
  })

  it('agent_admin sees "Property not found" for property in another agency', () => {
    mockUser = { id: 'u-viewer', name: 'Viewer', role: 'agent_admin', agencyId: 'ag-a' }
    mockAgencyId = 'ag-a'
    mockParamsId = 'p-other-agency'
    mockProperties = [{ ...baseProperty, id: 'p-other-agency', agencyId: 'ag-b' }]

    const html = renderToStaticMarkup(<MemoryRouter><PropertyDetail /></MemoryRouter>)
    expect(html).toContain('Property not found')
    expect(html).not.toContain('Test Property')
  })
})