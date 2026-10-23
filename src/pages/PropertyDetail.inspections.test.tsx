import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PropertyDetail from './PropertyDetail'

vi.mock('../components/alerts/SuiteAlert', () => ({ useSuiteAlert: () => ({ success: vi.fn() }) }))

vi.mock('../components/PropertyMap', () => ({ PropertyMap: () => null, PropertyMapPlaceholder: () => null }))
vi.mock('../components/property-detail/PropertyMapPanel', () => ({ PropertyMapPanel: () => null }))

vi.mock('../lib/inspections/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/inspections/api')>('../lib/inspections/api')
  return { ...actual, inspectionsAvailable: true }
})

// Captures every LeaseInspectionsPanel render so tests can assert its props.
const panelProps: Array<{ leaseId: string; mode: string }> = []
vi.mock('../components/inspections/LeaseInspectionsPanel', () => ({
  LeaseInspectionsPanel: (props: { leaseId: string; mode: string }) => {
    panelProps.push(props)
    return null
  },
}))

// Captures the lease <select> props (no DOM in this env) so (h) can fire its onChange.
const selectProps: { current: null | { onChange: (e: { target: { value: string } }) => void } } = { current: null }
function wrapJsx<T extends (...args: any[]) => unknown>(fn: T): T {
  return ((type: unknown, props: any, ...rest: unknown[]) => {
    if (type === 'select' && props?.id === 'landlord-inspections-lease') selectProps.current = props
    return fn(type, props, ...rest)
  }) as T
}
vi.mock('react/jsx-dev-runtime', async () => {
  const actual = await vi.importActual<typeof import('react/jsx-dev-runtime')>('react/jsx-dev-runtime')
  return { ...actual, jsxDEV: wrapJsx(actual.jsxDEV) }
})
vi.mock('react/jsx-runtime', async () => {
  const actual = await vi.importActual<typeof import('react/jsx-runtime')>('react/jsx-runtime')
  return { ...actual, jsx: wrapJsx(actual.jsx), jsxs: wrapJsx(actual.jsxs) }
})

let mockUser: { id: string; name: string; role: string; agencyId: string } = {
  id: 'u-ll',
  name: 'Landlord',
  role: 'landlord',
  agencyId: 'ag-a',
}
const mockHas = (_permission: string) => true
const mockAgencyId = 'ag-a'
const mockParamsId = 'p-own'
let mockProperties: any[] = []
let mockTenancies: any[] = []
let mockSearch = new URLSearchParams()
const mockSetParams = vi.fn()

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    has: mockHas,
    agencyId: mockAgencyId,
  }),
  usePropertyScope: () => ({
    inPropertyScope: (id: string) => mockProperties.some((p) => p.id === id && p.agencyId === mockAgencyId),
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
      tenancies: mockTenancies,
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
    useSearchParams: () => [mockSearch, mockSetParams],
  }
})

const baseProperty = {
  id: 'p-own',
  agencyId: 'ag-a',
  landlordId: 'u-ll',
  agentId: 'u-agent',
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

function lease(over: Record<string, unknown>) {
  return {
    id: 'l-1',
    agencyId: 'ag-a',
    propertyId: 'p-own',
    landlordId: 'u-ll',
    agentId: null,
    applicationId: null,
    tenantUserId: null,
    tenantName: 'Thandi',
    tenantEmail: 't@example.com',
    startDate: '2025-11-01',
    endDate: null,
    rent: 1000,
    deposit: 1000,
    status: 'Active',
    keyCollection: { location: '', instructions: '', contactName: '', contactPhone: '' },
    ...over,
  }
}

const landlord = { id: 'u-ll', name: 'Landlord', role: 'landlord', agencyId: 'ag-a' }

function render(search = '') {
  mockSearch = new URLSearchParams(search)
  panelProps.length = 0
  selectProps.current = null
  return renderToStaticMarkup(<MemoryRouter><PropertyDetail /></MemoryRouter>)
}

const hasInspectionsTab = (html: string) => />Inspections</.test(html)

describe('PropertyDetail landlord inspections tab', () => {
  beforeEach(() => {
    mockUser = landlord
    mockProperties = [baseProperty]
    mockTenancies = []
    mockSetParams.mockReset()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('(a) landlord with an Active tenancy on the property sees the Inspections tab', () => {
    mockTenancies = [lease({ id: 'l-active', status: 'Active' })]
    expect(hasInspectionsTab(render())).toBe(true)
  })

  it('(b) landlord with no tenancy on the property does not see the tab', () => {
    mockTenancies = [lease({ id: 'l-elsewhere', propertyId: 'p-other' })]
    expect(hasInspectionsTab(render())).toBe(false)
  })

  it("(c) another landlord's tenancy on the property does not count", () => {
    mockTenancies = [lease({ id: 'l-theirs', landlordId: 'u-other-ll' })]
    expect(hasInspectionsTab(render())).toBe(false)
    expect(hasInspectionsTab(render('tab=inspections'))).toBe(false)
    expect(panelProps).toHaveLength(0)
  })

  it('(d) ground_agent and client_admin never get the tab', () => {
    mockTenancies = [lease({ id: 'l-active', landlordId: 'u-staff' })]
    for (const role of ['ground_agent', 'client_admin']) {
      mockUser = { id: 'u-staff', name: 'Staff', role, agencyId: 'ag-a' }
      mockProperties = [{ ...baseProperty, agentId: 'u-staff' }]
      expect(hasInspectionsTab(render())).toBe(false)
      render('tab=inspections')
      expect(panelProps).toHaveLength(0)
    }
  })

  it('(e) ?tab=inspections renders the panel with mode="landlord" and the lease id', () => {
    mockTenancies = [lease({ id: 'l-active', status: 'Active' })]
    const html = render('tab=inspections')
    expect(panelProps).toEqual([{ leaseId: 'l-active', mode: 'landlord' }])
    expect(html).not.toContain('id="landlord-inspections-lease"')
  })

  it('(f) an Ended lease from 5 days ago beats a Pending Move-In lease', () => {
    mockTenancies = [
      lease({ id: 'l-next', status: 'Pending Move-In', startDate: '2026-11-01' }),
      lease({ id: 'l-ended', status: 'Ended', startDate: '2025-10-18', endDate: '2026-10-18' }),
    ]
    render('tab=inspections')
    expect(panelProps.at(-1)?.leaseId).toBe('l-ended')
  })

  it('(g) an Ended lease from 90 days ago loses to an Active lease', () => {
    mockTenancies = [
      lease({ id: 'l-old', status: 'Ended', startDate: '2024-07-25', endDate: '2026-07-25' }),
      lease({ id: 'l-active', status: 'Active', startDate: '2026-08-01' }),
    ]
    render('tab=inspections')
    expect(panelProps.at(-1)?.leaseId).toBe('l-active')
  })

  it('(g2) an Ended lease with a future end date does not outrank an Active lease', () => {
    mockTenancies = [
      lease({ id: 'l-future-ended', status: 'Ended', startDate: '2025-11-01', endDate: '2026-11-10' }),
      lease({ id: 'l-active', status: 'Active', startDate: '2026-08-01' }),
    ]
    render('tab=inspections')
    expect(panelProps.at(-1)?.leaseId).toBe('l-active')
  })

  it('(i) recent Ended leases are ordered most recent first, ahead of an old Ended one', () => {
    mockTenancies = [
      lease({ id: 'l-old', status: 'Ended', tenantName: 'Old', startDate: '2024-07-01', endDate: '2026-07-01' }),
      lease({ id: 'l-20d', status: 'Ended', tenantName: 'Twenty', startDate: '2025-10-03', endDate: '2026-10-03' }),
      lease({ id: 'l-5d', status: 'Ended', tenantName: 'Five', startDate: '2025-10-18', endDate: '2026-10-18' }),
    ]
    const html = render('tab=inspections')
    expect(panelProps.at(-1)?.leaseId).toBe('l-5d')
    const order = [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1])
    expect(order).toEqual(['l-5d', 'l-20d', 'l-old'])
  })

  it('(h) the lease select shows only with 2+ candidates and switching it changes the leaseId', () => {
    mockTenancies = [lease({ id: 'l-active', status: 'Active' })]
    expect(render('tab=inspections')).not.toContain('id="landlord-inspections-lease"')
    expect(selectProps.current).toBeNull()

    mockTenancies = [
      lease({ id: 'l-active', status: 'Active', tenantName: 'Thandi', startDate: '2026-08-01' }),
      lease({ id: 'l-next', status: 'Pending Move-In', tenantName: 'Sipho', startDate: '2026-12-01' }),
    ]
    const html = render('tab=inspections')
    expect(html).toContain('id="landlord-inspections-lease"')
    expect(html).toContain('<label for="landlord-inspections-lease"')
    expect(html).toContain('Thandi · Active · 2026-08-01–ongoing')
    expect(html).toContain('Sipho · Pending Move-In · 2026-12-01–ongoing')
    expect(panelProps.at(-1)?.leaseId).toBe('l-active')

    selectProps.current!.onChange({ target: { value: 'l-next' } })
    expect(mockSetParams).toHaveBeenCalledTimes(1)
    const next = mockSetParams.mock.calls[0][0] as URLSearchParams
    expect(next.get('lease')).toBe('l-next')
    expect(next.get('tab')).toBe('inspections')

    render(next.toString())
    expect(panelProps.at(-1)).toEqual({ leaseId: 'l-next', mode: 'landlord' })
  })
})
