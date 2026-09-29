import { describe, expect, it } from 'vitest'
import { mapGuestMarketplacePayload } from './mapGuestMarketplace'

const clientId = 'a1000001-0001-4000-8000-000000000099'
const buildingId = 'b1000001-0001-4000-8000-000000000001'
const unitId = 'a4000001-0001-4000-8000-000000000099'
const landlordId = 'c1000001-0001-4000-8000-000000000001'

function payload(extra: Record<string, unknown> = {}) {
  return {
    clients: [
      {
        id: clientId,
        company_name: 'Horizon',
        subdomain: 'horizon',
        city: 'Gqeberha',
        status: 'active',
        created_at: '2026-01-01',
        settings: { frontend_id: 'ag-horizon' },
      },
    ],
    buildings: [
      {
        id: buildingId,
        client_id: clientId,
        landlord_id: landlordId,
        landlord_name: 'Trust Owner',
        name: 'Harbour Block',
        address: '1 Main Road',
        suburb: 'Summerstrand',
        city: 'Gqeberha',
        province: 'EC',
        images: [],
        created_at: '2026-01-01',
      },
    ],
    units: [
      {
        id: unitId,
        client_id: clientId,
        building_id: buildingId,
        unit_number: '1',
        title: 'Sea flat',
        bedrooms: 2,
        bathrooms: 1,
        parking: 1,
        square_meters: 70,
        listing_type: 'rent',
        rent: 8000,
        status_config_key: 'PUBLISHED',
        description: 'A flat',
        amenities: [],
        images: [],
        featured: false,
        created_at: '2026-01-02',
        landlord_id: landlordId,
        landlord_name: 'Trust Owner',
      },
    ],
    users: [
      {
        id: landlordId,
        email: 'trust@owners.co.za',
        first_name: 'Should',
        last_name: 'Ignore',
        role: 'LANDLORD',
        active: true,
        client_id: clientId,
        phone: '0820000000',
        metadata: {},
      },
    ],
    entity_id_map: [
      { entity_type: 'user', backend_id: landlordId, frontend_id: 'fe-landlord' },
      { entity_type: 'agency', backend_id: clientId, frontend_id: 'ag-horizon' },
    ],
    ...extra,
  }
}

describe('mapGuestMarketplacePayload landlords', () => {
  it('keys the landlord on landlord_id and landlord_name, not email', () => {
    const mapped = mapGuestMarketplacePayload(payload())
    const property = mapped.properties[0] as { landlordId: string; title: string }
    expect(property.landlordId).toBe('fe-landlord')
    expect(property.landlordId).not.toBe('u-owner1')

    const landlord = (mapped.users as Array<{ id: string; name: string; email: string }>).find(
      (u) => u.id === 'fe-landlord',
    )
    expect(landlord).toMatchObject({
      id: 'fe-landlord',
      name: 'Trust Owner',
      email: '',
    })
    expect(JSON.stringify(mapped.users)).not.toContain('trust@owners.co.za')
    expect(JSON.stringify(mapped.users)).not.toContain('0820000000')
  })

  it('uses the listing projection when the users array is absent', () => {
    const mapped = mapGuestMarketplacePayload(payload({ users: [], entity_id_map: [] }))
    const property = mapped.properties[0] as { landlordId: string }
    expect(property.landlordId).toBe(landlordId)
    const landlord = (mapped.users as Array<{ id: string; name: string; email: string }>)[0]
    expect(landlord).toMatchObject({
      id: landlordId,
      name: 'Trust Owner',
      email: '',
      role: 'landlord',
    })
  })
})
