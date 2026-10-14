import { describe, expect, it } from 'vitest'
import {
  bootstrapHasPublicBrowseListings,
  mergePublicMarketplaceBootstrap,
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
    expect(merged.properties?.[0]).toMatchObject({ id: 'PR-1001', title: 'Staff copy' })
  })
})
