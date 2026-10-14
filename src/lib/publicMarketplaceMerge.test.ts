import { describe, expect, it } from 'vitest'
import {
  bootstrapHasPublicBrowseListings,
  mergeListingLookupState,
  mergePublicMarketplaceBootstrap,
  needsPublicMarketplaceMerge,
} from './publicMarketplaceMerge'
import type { PostgresBootstrap } from './api/postgresClient'

describe('mergePublicMarketplaceBootstrap', () => {
  it('adds public listings to an empty scoped session boot', () => {
    const session: PostgresBootstrap = {
      source: 'postgres',
      fetchedAt: 't1',
      scoped: true,
      agencies: [],
      users: [{ id: 'u-me', role: 'tenant', name: 'Me', email: 'me@test.com' } as never],
      buildings: [],
      units: [],
      properties: [],
      leads: [],
      applications: [{ id: 'app-1' } as never],
      tenancies: [],
      viewings: [],
      payments: [],
      propertyDocuments: [],
      tickets: [],
      threads: [],
      messages: [],
      notifications: [],
    }
    const pub: PostgresBootstrap = {
      source: 'postgres',
      fetchedAt: 't2',
      agencies: [{ id: 'ag-1', name: 'Agency' } as never],
      users: [{ id: 'u-ag', role: 'agent_admin', name: 'Agent' } as never],
      buildings: [{ id: 'b-1' } as never],
      units: [{ id: 'unt-1', statusKey: 'PUBLISHED', listingType: 'rent' } as never],
      properties: [
        {
          id: 'PR-1001',
          status: 'Published',
          unitId: 'unt-1',
          landlordId: 'u-ll',
        } as never,
      ],
      leads: [],
      applications: [],
      tenancies: [],
      viewings: [],
      payments: [],
      propertyDocuments: [],
      tickets: [],
      threads: [],
      messages: [],
      notifications: [],
    }

    const merged = mergePublicMarketplaceBootstrap(session, pub)
    expect(merged.applications).toHaveLength(1)
    expect(merged.properties).toHaveLength(1)
    expect(merged.properties?.[0]).toMatchObject({ id: 'PR-1001' })
    expect(bootstrapHasPublicBrowseListings(merged)).toBe(true)
  })

  it('keeps session property rows when ids overlap', () => {
    const session: PostgresBootstrap = {
      source: 'postgres',
      fetchedAt: 't1',
      agencies: [],
      users: [],
      buildings: [],
      units: [{ id: 'unt-1', statusKey: 'DRAFT', listingType: 'rent' } as never],
      properties: [{ id: 'PR-1001', status: 'Draft', title: 'Staff copy', unitId: 'unt-1' } as never],
      leads: [],
      applications: [],
      tenancies: [],
      viewings: [],
      payments: [],
      propertyDocuments: [],
      tickets: [],
      threads: [],
      messages: [],
      notifications: [],
    }
    const pub: PostgresBootstrap = {
      source: 'postgres',
      fetchedAt: 't2',
      agencies: [],
      users: [],
      buildings: [],
      units: [{ id: 'unt-1', statusKey: 'PUBLISHED', listingType: 'rent' } as never],
      properties: [{ id: 'PR-1001', status: 'Published', title: 'Public copy', unitId: 'unt-1' } as never],
      leads: [],
      applications: [],
      tenancies: [],
      viewings: [],
      payments: [],
      propertyDocuments: [],
      tickets: [],
      threads: [],
      messages: [],
      notifications: [],
    }

    const merged = mergePublicMarketplaceBootstrap(session, pub)
    // Portal draft must not shadow the published marketplace row on /browse.
    expect(merged.properties?.[0]).toMatchObject({ id: 'PR-1001', title: 'Public copy', status: 'Published' })
    expect(merged.units?.[0]).toMatchObject({ id: 'unt-1', statusKey: 'PUBLISHED' })
    expect(bootstrapHasPublicBrowseListings(merged)).toBe(true)
  })

  it('prefers public unit rows when scoped session copy is not marketplace-visible', () => {
    const session: PostgresBootstrap = {
      source: 'postgres',
      fetchedAt: 't1',
      scoped: true,
      agencies: [],
      users: [],
      buildings: [{ id: 'b-1' } as never],
      units: [{ id: 'unt-PR-1655', statusKey: 'OCCUPIED', listingType: 'rent', buildingId: 'b-1' } as never],
      properties: [
        {
          id: 'PR-1655',
          status: 'Published',
          title: 'E2E TEST Agency Flat 1655',
          unitId: 'unt-PR-1655',
        } as never,
      ],
      leads: [],
      applications: [{ id: 'app-1', propertyId: 'PR-1655' } as never],
      tenancies: [],
      viewings: [],
      payments: [],
      propertyDocuments: [],
      tickets: [],
      threads: [],
      messages: [],
      notifications: [],
    }
    const pub: PostgresBootstrap = {
      source: 'postgres',
      fetchedAt: 't2',
      agencies: [],
      users: [],
      buildings: [{ id: 'b-1' } as never],
      units: [{ id: 'unt-PR-1655', statusKey: 'PUBLISHED', listingType: 'rent', buildingId: 'b-1' } as never],
      properties: [
        {
          id: 'PR-1655',
          status: 'Published',
          title: 'E2E TEST Agency Flat 1655',
          unitId: 'unt-PR-1655',
          listingMode: 'rent',
          rent: 12000,
        } as never,
      ],
      leads: [],
      applications: [],
      tenancies: [],
      viewings: [],
      payments: [],
      propertyDocuments: [],
      tickets: [],
      threads: [],
      messages: [],
      notifications: [],
    }

    const merged = mergePublicMarketplaceBootstrap(session, pub)
    expect(bootstrapHasPublicBrowseListings(merged)).toBe(true)
    expect(merged.units?.[0]).toMatchObject({ statusKey: 'PUBLISHED' })
  })

  it('does not treat a Published property with a non-marketplace unit as browse-ready', () => {
    const boot: PostgresBootstrap = {
      source: 'postgres',
      fetchedAt: 't1',
      scoped: true,
      agencies: [],
      users: [],
      buildings: [],
      units: [{ id: 'unt-PR-1001', statusKey: 'OCCUPIED', listingType: 'rent' } as never],
      properties: [{ id: 'PR-1001', status: 'Published', unitId: 'unt-PR-1001' } as never],
      leads: [],
      applications: [],
      tenancies: [],
      viewings: [],
      payments: [],
      propertyDocuments: [],
      tickets: [],
      threads: [],
      messages: [],
      notifications: [],
    }
    expect(bootstrapHasPublicBrowseListings(boot)).toBe(false)
  })
})

describe('mergeListingLookupState', () => {
  it('resolves a listing id from a one-off public slice', () => {
    const state = {
      properties: [] as never[],
      units: [] as never[],
      users: [] as never[],
      viewingSlots: [],
    }
    const pub: PostgresBootstrap = {
      source: 'postgres',
      fetchedAt: 't2',
      agencies: [],
      users: [],
      buildings: [],
      units: [{ id: 'unt-1', statusKey: 'PUBLISHED', listingType: 'rent' } as never],
      properties: [{ id: 'PR-1001', status: 'Published', unitId: 'unt-1' } as never],
      viewingSlots: [{ id: 'slot-1', propertyId: 'PR-1001', status: 'Open' } as never],
      leads: [],
      applications: [],
      tenancies: [],
      viewings: [],
      payments: [],
      propertyDocuments: [],
      tickets: [],
      threads: [],
      messages: [],
      notifications: [],
    }
    const merged = mergeListingLookupState(state, pub)
    expect(merged.properties).toHaveLength(1)
    expect(merged.properties[0]?.id).toBe('PR-1001')
    expect(merged.viewingSlots).toHaveLength(1)
  })
})

describe('needsPublicMarketplaceMerge', () => {
  it('requests merge for scoped portal boots without marketplace units', () => {
    const boot: PostgresBootstrap = {
      source: 'postgres',
      fetchedAt: 't1',
      scoped: true,
      agencies: [],
      users: [],
      buildings: [],
      units: [{ id: 'unt-PR-9', statusKey: 'OCCUPIED', listingType: 'rent' } as never],
      properties: [{ id: 'PR-9', status: 'Published', unitId: 'unt-PR-9' } as never],
      leads: [],
      applications: [],
      tenancies: [],
      viewings: [],
      payments: [],
      propertyDocuments: [],
      tickets: [],
      threads: [],
      messages: [],
      notifications: [],
    }
    expect(bootstrapHasPublicBrowseListings(boot)).toBe(false)
    expect(needsPublicMarketplaceMerge(boot)).toBe(true)
  })

  it('skips merge for agency-wide boots that already render browse', () => {
    const boot: PostgresBootstrap = {
      source: 'postgres',
      fetchedAt: 't1',
      scoped: false,
      agencies: [],
      users: [],
      buildings: [{ id: 'b-1' } as never],
      units: [{ id: 'unt-1', statusKey: 'PUBLISHED', listingType: 'rent' } as never],
      properties: [{ id: 'PR-1001', status: 'Published', unitId: 'unt-1' } as never],
      leads: [],
      applications: [],
      tenancies: [],
      viewings: [],
      payments: [],
      propertyDocuments: [],
      tickets: [],
      threads: [],
      messages: [],
      notifications: [],
    }
    expect(needsPublicMarketplaceMerge(boot)).toBe(false)
  })
})

describe('mergePublicMarketplaceBootstrap (signed-in browse q=)', () => {
  it('keeps public E2E listing when scoped session boot is empty', () => {
    const e2eTitle = 'E2E TEST Agency Flat 1655'
    const session = {
      source: 'postgres' as const,
      fetchedAt: 't1',
      scoped: true,
      agencies: [],
      users: [],
      buildings: [],
      units: [],
      properties: [],
      leads: [],
      applications: [{ id: 'app-1' } as never],
      tenancies: [],
      viewings: [],
      payments: [],
      propertyDocuments: [],
      tickets: [],
      threads: [],
      messages: [],
      notifications: [],
    }
    const pub = {
      ...session,
      scoped: false,
      units: [{ id: 'unt-e2e', statusKey: 'PUBLISHED', listingType: 'rent' } as never],
      properties: [
        {
          id: 'PR-1655',
          title: e2eTitle,
          status: 'Published',
          unitId: 'unt-e2e',
          agencyId: 'ag-1',
        } as never,
      ],
    }
    const merged = mergePublicMarketplaceBootstrap(session, pub)
    expect(merged.properties.some((p) => p.title.includes('E2E TEST Agency Flat'))).toBe(true)
    expect(merged.units.some((u) => u.id === 'unt-e2e')).toBe(true)
  })
})
