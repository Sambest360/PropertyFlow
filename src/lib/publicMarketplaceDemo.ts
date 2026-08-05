import {
  propertiesFromInfrastructure,
  seedBuildings,
  seedLookups,
  seedUnits,
} from '../data/infraSeed'
import { seedAgencies, seedUsers } from '../data/seed'
import type { PostgresBootstrap } from './api/postgresClient'
import { isPubliclyListed } from './publicListings'

/** Offline / dev fallback — published marketplace slice without signing in. */
export function buildPublicMarketplaceDemoBootstrap(): PostgresBootstrap {
  const properties = propertiesFromInfrastructure().filter((p) =>
    isPubliclyListed(p, { units: seedUnits, users: seedUsers }),
  )
  const unitIds = new Set(properties.map((p) => p.unitId).filter(Boolean) as string[])
  const units = seedUnits.filter((u) => unitIds.has(u.id))
  const buildingIds = new Set(units.map((u) => u.buildingId))
  const buildings = seedBuildings.filter((b) => buildingIds.has(b.id))
  const agencyIds = new Set(properties.map((p) => p.agencyId))
  const agencies = seedAgencies.filter((a) => agencyIds.has(a.id))
  const landlordIds = new Set(properties.map((p) => p.landlordId).filter(Boolean) as string[])
  const users = seedUsers.filter((u) => landlordIds.has(u.id))

  return {
    source: 'postgres',
    fetchedAt: new Date().toISOString(),
    scoped: false,
    actor: null,
    agencies,
    users,
    buildings,
    units,
    properties,
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
    lookups: seedLookups,
  }
}
