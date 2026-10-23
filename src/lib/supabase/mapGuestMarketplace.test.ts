import { describe, expect, it } from 'vitest'
import { mapGuestMarketplacePayload } from './mapGuestMarketplace'

// PostgresBootstrap arrays are unknown[]; read rows as plain records in assertions.
type Row = Record<string, unknown>
const rows = (xs: unknown[] | undefined): Row[] => (xs ?? []) as Row[]

describe('mapGuestMarketplacePayload viewing_slots', () => {
  const unitUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const slotUuid = '11111111-2222-3333-4444-555555555555'
  const clientUuid = 'cccccccc-dddd-eeee-ffff-000000000001'
  const buildingUuid = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'

  it('maps viewing_slots to property ids aligned with listing properties', () => {
    const boot = mapGuestMarketplacePayload({
      clients: [
        {
          id: clientUuid,
          company_name: 'Test Agency',
          settings: {},
        },
      ],
      buildings: [
        {
          id: buildingUuid,
          client_id: clientUuid,
          name: 'Block A',
          address_line1: '1 Main',
          city: 'Cape Town',
          suburb: 'CBD',
          images: [],
        },
      ],
      units: [
        {
          id: unitUuid,
          client_id: clientUuid,
          building_id: buildingUuid,
          unit_number: '1',
          title: 'Flat 1',
          status_config_key: 'PUBLISHED',
          listing_type: 'rent',
          bedrooms: 2,
          rent: 8990,
        },
      ],
      entity_id_map: [
        { entity_type: 'property', backend_id: unitUuid, frontend_id: 'PR-9001' },
        { entity_type: 'unit', backend_id: unitUuid, frontend_id: 'unt-PR-9001' },
        { entity_type: 'viewing_slot', backend_id: slotUuid, frontend_id: 'VS-1' },
      ],
      viewing_slots: [
        {
          id: slotUuid,
          client_id: clientUuid,
          unit_id: unitUuid,
          agent_id: null,
          slot_date: '2026-12-01',
          slot_time: '10:00:00',
          capacity: 3,
          booked_count: 0,
          status: 'OPEN',
          title: 'Morning viewing',
        },
      ],
    })

    expect(boot.properties).toHaveLength(1)
    expect(boot.viewingSlots).toHaveLength(1)
    expect(rows(boot.viewingSlots)[0].id).toBe('VS-1')
    expect(rows(boot.viewingSlots)[0].status).toBe('Open')
    expect(rows(boot.viewingSlots)[0].propertyId).toBe(rows(boot.properties)[0].id)
    expect(rows(boot.viewingSlots)[0].propertyId).toBe('PR-9001')
  })
})

describe('mapGuestMarketplacePayload with the 027 public payload', () => {
  const clientUuid = 'cccccccc-dddd-eeee-ffff-000000000002'
  const buildingUuid = 'bbbbbbbb-cccc-dddd-eeee-000000000002'
  const unitUuid = 'aaaaaaaa-bbbb-cccc-dddd-000000000002'
  const slotUuid = '11111111-2222-3333-4444-000000000002'

  it('renders agencies, listings and slots from explicit keys with users []', () => {
    const boot = mapGuestMarketplacePayload({
      clients: [
        {
          id: clientUuid,
          company_name: 'Explicit Realty',
          trading_as: 'Explicit',
          subdomain: 'explicit',
          city: 'Durban',
          status: 'ACTIVE',
          created_at: '2026-01-01T00:00:00Z',
          frontend_id: 'AG-EXPLICIT',
        },
      ],
      buildings: [
        {
          id: buildingUuid,
          client_id: clientUuid,
          name: 'Tower',
          address: '9 Beach Rd',
          suburb: 'Umhlanga',
          city: 'Durban',
          province: 'KZN',
          images: ['cover.jpg'],
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      units: [
        {
          id: unitUuid,
          client_id: clientUuid,
          building_id: buildingUuid,
          unit_number: '12',
          title: 'Sea view flat',
          status_config_key: 'OCCUPIED',
          listing_type: 'RENT',
          advertise_while_occupied: true,
          available_from: '2027-02-01',
          rent: 12000,
          images: [],
          fully_booked: false,
          remaining: { enquiries: 5, viewings: 2 },
        },
      ],
      users: [],
      entity_id_map: [
        { entity_type: 'property', backend_id: unitUuid, frontend_id: 'PR-EXP' },
        { entity_type: 'viewing_slot', backend_id: slotUuid, frontend_id: 'VS-EXP' },
      ],
      viewing_slots: [
        {
          id: slotUuid,
          client_id: clientUuid,
          unit_id: unitUuid,
          slot_date: '2027-01-10',
          slot_time: '10:00',
          capacity: 2,
          booked_count: 0,
          status: 'OPEN',
          title: 'Viewing',
          duration_minutes: 30,
        },
      ],
    })

    expect(boot.users).toEqual([])
    expect(boot.agencies).toHaveLength(1)
    expect(rows(boot.agencies)[0].id).toBe('AG-EXPLICIT')
    expect(rows(boot.agencies)[0].name).toBe('Explicit Realty')
    expect(boot.properties).toHaveLength(1)
    const p = rows(boot.properties)[0]
    expect(p.id).toBe('PR-EXP')
    expect(p.agencyId).toBe('AG-EXPLICIT')
    expect(p.landlordId).toBe('')
    expect(p.agentId).toBeNull()
    expect(p.advertiseWhileOccupied).toBe(true)
    expect(p.availableFrom).toBe('2027-02-01')
    expect(p.images).toEqual(['cover.jpg'])
    expect(p.city).toBe('Durban')
    expect(rows(boot.buildings)[0].landlordId).toBeNull()
    expect(boot.viewingSlots).toHaveLength(1)
    expect(rows(boot.viewingSlots)[0].propertyId).toBe('PR-EXP')
    expect(rows(boot.viewingSlots)[0].agentId).toBe('')
  })

  it('ignores landlord / agent ids even if an older payload still sends them', () => {
    const boot = mapGuestMarketplacePayload({
      clients: [{ id: clientUuid, company_name: 'Old', settings: { frontend_id: 'AG-OLD' } }],
      buildings: [{ id: buildingUuid, client_id: clientUuid, name: 'B', address: 'A', city: 'C', landlord_id: 'llll-uuid' }],
      units: [{ id: unitUuid, client_id: clientUuid, building_id: buildingUuid, unit_number: '1', agent_id: 'agent-uuid', status_config_key: 'PUBLISHED' }],
      users: [{ id: 'llll-uuid', email: 'landlord@example.test', first_name: 'L', last_name: 'L', role: 'LANDLORD' }],
      entity_id_map: [{ entity_type: 'user', backend_id: 'llll-uuid', frontend_id: 'U-LL' }],
    })
    expect(boot.users).toEqual([])
    expect(rows(boot.agencies)[0].id).toBe('AG-OLD')
    expect(rows(boot.properties)[0].landlordId).toBe('')
    expect(rows(boot.properties)[0].agentId).toBeNull()
    expect(JSON.stringify(boot.properties)).not.toContain('landlord@example.test')
  })

  it('maps 027 listed_by to the property agentName (Supabase-only "Listed by"), no agent id', () => {
    const boot = mapGuestMarketplacePayload({
      clients: [{ id: clientUuid, company_name: 'Agency', settings: { frontend_id: 'AG-LB' } }],
      buildings: [{ id: buildingUuid, client_id: clientUuid, name: 'B', address: 'A', city: 'C' }],
      units: [
        { id: unitUuid, client_id: clientUuid, building_id: buildingUuid, unit_number: '1', status_config_key: 'PUBLISHED', listed_by: '  Pam Beesly ' },
        { id: 'aaaaaaaa-bbbb-cccc-dddd-000000000002', client_id: clientUuid, building_id: buildingUuid, unit_number: '2', status_config_key: 'PUBLISHED', listed_by: null },
      ],
    })
    const props = rows(boot.properties)
    expect(props[0].agentName).toBe('Pam Beesly')
    expect(props[0].agentId).toBeNull()
    expect(props[1].agentName).toBeNull()
    // The unit slice does not carry the helper field.
    expect(rows(boot.units).some((u) => '_listedBy' in u || 'listed_by' in u)).toBe(false)
  })
})
