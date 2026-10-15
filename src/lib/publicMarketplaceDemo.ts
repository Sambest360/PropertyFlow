import type { PostgresBootstrap } from './api/postgresClient'

/** Empty guest marketplace slice — no infra seed listings. */
export function emptyPublicMarketplaceBootstrap(): PostgresBootstrap {
  return {
    source: 'postgres',
    fetchedAt: new Date().toISOString(),
    scoped: false,
    actor: null,
    agencies: [],
    users: [],
    buildings: [],
    units: [],
    properties: [],
    leads: [],
    applications: [],
    tenancies: [],
    viewings: [],
    viewingSlots: [],
    payments: [],
    propertyDocuments: [],
    tickets: [],
    threads: [],
    messages: [],
    notifications: [],
    suiteAlerts: [],
    activities: [],
    propertyEvents: [],
    invoices: [],
    lookups: [],
    marketplaceFetchFailed: false,
  }
}

export function emptyPublicMarketplaceBootstrapWithReason(
  marketplaceFetchFailed: boolean,
): PostgresBootstrap {
  return {
    ...emptyPublicMarketplaceBootstrap(),
    marketplaceFetchFailed,
  }
}