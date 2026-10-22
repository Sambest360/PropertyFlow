import { describe, expect, it } from 'vitest'
import { filterBootstrapForGuest, isGuestVisibleProperty } from './guestMarketplace.js'

describe('guest marketplace published listings (Issue 2)', () => {
  // DB-backed live listing title — unchanged until production data is renamed.
  const e2eTitle = 'E2E Letkaya Published Flat'

  const raw = {
    properties: [
      {
        id: 'PR-e2e-1',
        title: e2eTitle,
        status: 'Published',
        unitId: 'unt-e2e-1',
        landlordId: 'll-verified',
        agencyId: 'ag-1',
        deletedAt: null,
      },
    ],
    units: [
      {
        id: 'unt-e2e-1',
        statusKey: 'PUBLISHED',
        listingType: 'rent',
        propertyId: 'PR-e2e-1',
      },
    ],
    users: [{ id: 'll-verified', verification: { status: 'verified' } }],
    buildings: [],
    agencies: [{ id: 'ag-1', name: 'Test Agency' }],
  }

  it('includes published property + unit in guest slice', () => {
    expect(isGuestVisibleProperty(raw.properties[0], raw.units, raw.users)).toBe(true)
    const slice = filterBootstrapForGuest(raw)
    const props = slice.properties as Array<{ title?: string }>
    expect(props.some((p) => String(p.title).includes('Letkaya Published'))).toBe(true)
  })

  it('drops draft units from guest slice', () => {
    const draft = {
      ...raw,
      units: [{ ...raw.units[0], statusKey: 'DRAFT' }],
    }
    expect(isGuestVisibleProperty(draft.properties[0], draft.units, draft.users)).toBe(false)
  })
})
