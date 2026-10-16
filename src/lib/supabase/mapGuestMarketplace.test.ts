import { describe, expect, it } from 'vitest'
import { mapGuestMarketplacePayload } from './mapGuestMarketplace'

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
    expect(boot.viewingSlots[0].id).toBe('VS-1')
    expect(boot.viewingSlots[0].status).toBe('Open')
    expect(boot.viewingSlots[0].propertyId).toBe(boot.properties[0].id)
    expect(boot.viewingSlots[0].propertyId).toBe('PR-9001')
  })
})
