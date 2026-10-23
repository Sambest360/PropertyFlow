import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DemoActor } from './actor.js'
import {
  getViewingWindows,
  listTenantViewingRequests,
  patchTenantBookingResponse,
  putViewingWindows,
  type OccupiedDeps,
} from './occupiedListing.js'

const MIGRATION = readFileSync('database/postgres/migrations/027_advertise_while_occupied.sql', 'utf8')
const INDEX = readFileSync('server/index.ts', 'utf8')
const SCHEMA = readFileSync('database/postgres/schema.sql', 'utf8')

const CLIENT = '00000000-0000-4000-8000-0000000000a1'
const UNIT = '00000000-0000-4000-8000-0000000000b1'
const LEASE = '00000000-0000-4000-8000-0000000000c1'
const BOOKING = '00000000-0000-4000-8000-0000000000d1'
const TENANT = '00000000-0000-4000-8000-000000000105'
const OTHER_TENANT = '00000000-0000-4000-8000-000000000107'

const tenant = { role: 'tenant', userId: 'U-e2e-tenant', agencyId: null } as DemoActor
const otherTenant = { role: 'tenant', userId: 'U-e2e-other', agencyId: null } as DemoActor
const agent = { role: 'agent_admin', userId: 'U-e2e-agent', agencyId: 'AG-e2e' } as DemoActor
const landlord = { role: 'landlord', userId: 'U-e2e-landlord', agencyId: null } as DemoActor

function deps(): OccupiedDeps & { writes: string[] } {
  const writes: string[] = []
  return {
    writes,
    query: async (sql: string) => {
      if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) writes.push(sql)
      if (sql.includes('FROM leases WHERE id')) {
        return [{ id: LEASE, client_id: CLIENT, unit_id: UNIT, tenant_id: TENANT }]
      }
      if (sql.includes('FROM bookings b WHERE b.id')) {
        return [{ client_id: CLIENT, unit_id: UNIT, agent_id: null, tenant_consent_status: 'PENDING' }]
      }
      if (sql.includes('SELECT tenant_id::text AS tenant_id FROM leases')) return [{ tenant_id: TENANT }]
      return []
    },
    resolveUuid: async (type: string, id: string) => {
      if (type === 'user' && id === tenant.userId) return TENANT
      if (type === 'user' && id === otherTenant.userId) return OTHER_TENANT
      if (type === 'tenancy' && id === LEASE) return LEASE
      if (type === 'viewing' && id === BOOKING) return BOOKING
      return null
    },
    assertUnitManageable: async () => ({ clientId: CLIENT }),
    canPublish: async () => true,
    now: () => new Date('2027-02-01T08:00:00Z'),
  } as OccupiedDeps & { writes: string[] }
}

describe('occupied adverts are wired end to end', () => {
  it('registers every occupied-listing API route on the server', () => {
    for (const route of [
      "app.patch('/api/units/:id/advertise-while-occupied'",
      "app.post('/api/leases/:id/notice'",
      "app.get('/api/leases/:id/viewing-windows'",
      "app.put('/api/leases/:id/viewing-windows'",
      "app.get('/api/leases/:id/viewing-requests'",
      "app.patch('/api/bookings/:id/tenant-response'",
    ]) {
      expect(INDEX).toContain(route)
    }
    expect(INDEX).toContain("import('./occupiedListing.js')")
  })

  it('mounts the agent card on property detail and the tenant card on the tenant portal', () => {
    const detail = readFileSync('src/pages/PropertyDetail.tsx', 'utf8')
    const portal = readFileSync('src/pages/TenantPortal.tsx', 'utf8')
    expect(detail).toMatch(/import \{ OccupiedAdvertCard \}/)
    expect(detail).toContain('<OccupiedAdvertCard')
    expect(portal).toMatch(/import \{ OccupiedHomeAdvertCard \}/)
    expect(portal).toContain('<OccupiedHomeAdvertCard')
    // Main's inspections panel survived the merge alongside it.
    expect(portal).toContain('<LeaseInspectionsPanel')
  })

  it('wires the booking and enquiry paths to the occupied checks', () => {
    expect(readFileSync('server/writes.ts', 'utf8')).toContain('occupiedListing')
    expect(readFileSync('server/publicEnquiry.ts', 'utf8')).toContain('occupiedListing')
  })
})

describe('viewing windows and tenant responses: only the sitting tenant', () => {
  it('lets the tenant on the lease read and replace their windows', async () => {
    const d = deps()
    await expect(getViewingWindows(tenant, LEASE, d)).resolves.toEqual([])
    await putViewingWindows(tenant, LEASE, [{ weekday: 2, windowDate: null, startTime: '09:00', endTime: '12:00' }], d)
    expect(d.writes.some((sql) => sql.includes('INSERT INTO tenant_viewing_windows'))).toBe(true)
  })

  it('refuses another tenant, an agent and a landlord on the windows and request list', async () => {
    for (const actor of [otherTenant, agent, landlord]) {
      const d = deps()
      await expect(getViewingWindows(actor, LEASE, d)).rejects.toMatchObject({ status: 403 })
      await expect(
        putViewingWindows(actor, LEASE, [{ weekday: 1, windowDate: null, startTime: '09:00', endTime: '10:00' }], d),
      ).rejects.toMatchObject({ status: 403 })
      await expect(listTenantViewingRequests(actor, LEASE, d)).rejects.toMatchObject({ status: 403 })
      expect(d.writes).toEqual([])
    }
  })

  it('only the sitting tenant can answer a viewing request', async () => {
    const d = deps()
    await expect(patchTenantBookingResponse(otherTenant, BOOKING, { status: 'ACCEPTED' }, d)).rejects.toMatchObject({
      status: 403,
    })
    await expect(patchTenantBookingResponse(agent, BOOKING, { status: 'DECLINED' }, d)).rejects.toMatchObject({
      status: 403,
    })
    expect(d.writes).toEqual([])
    await expect(patchTenantBookingResponse(tenant, BOOKING, { status: 'ACCEPTED' }, d)).resolves.toEqual({
      status: 'ACCEPTED',
    })
  })
})

describe('027 tenant_viewing_windows RLS', () => {
  function policy(name: string): string {
    const start = MIGRATION.indexOf(`CREATE POLICY ${name}`)
    expect(start).toBeGreaterThan(-1)
    return MIGRATION.slice(start, MIGRATION.indexOf(';', start))
  }

  it('select has no role-wide clause: own-client staff, the lease tenant, the unit landlord', () => {
    const select = policy('tenant_viewing_windows_select')
    expect(select).not.toMatch(/IN \('LANDLORD', 'END_USER', 'CONTRACTOR'\)/)
    expect(select).not.toContain('CONTRACTOR')
    expect(select).toMatch(/'AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT'\)\s+AND client_id = current_app_client_id\(\)/)
    expect(select).toMatch(/l\.id = tenant_viewing_windows\.lease_id\s+AND l\.tenant_id = current_app_user_id\(\)/)
    expect(select).toMatch(/u\.id = tenant_viewing_windows\.unit_id\s+AND b\.landlord_id = current_app_user_id\(\)/)
    // Never a bare "same client" clause for every role.
    expect(select).not.toMatch(/OR client_id = current_app_client_id\(\)/)
  })

  it('mutate is limited to own-client staff and the tenant on the lease', () => {
    const mutate = policy('tenant_viewing_windows_mutate')
    expect(mutate).not.toMatch(/OR client_id = current_app_client_id\(\)/)
    expect(mutate).not.toContain("'LANDLORD'")
    expect(mutate).toContain('l.tenant_id = current_app_user_id()')
  })

  it('is add-only and re-runnable', () => {
    expect(MIGRATION).not.toMatch(/DROP TABLE/i)
    expect(MIGRATION).not.toMatch(/DROP COLUMN/i)
    expect(MIGRATION).toContain('CREATE TABLE IF NOT EXISTS tenant_viewing_windows')
    for (const m of MIGRATION.matchAll(/ADD COLUMN (?!IF NOT EXISTS)/g)) throw new Error(`non-idempotent: ${m[0]}`)
    for (const m of MIGRATION.matchAll(/CREATE POLICY (\w+)/g)) {
      expect(MIGRATION).toContain(`DROP POLICY IF EXISTS ${m[1]}`)
    }
    // No bare CREATE TABLE / INDEX / FUNCTION; constraints are added only when missing.
    expect(MIGRATION).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/)
    expect(MIGRATION).not.toMatch(/CREATE FUNCTION/)
    for (const m of MIGRATION.matchAll(/^CREATE INDEX (?!IF NOT EXISTS)/gm)) throw new Error(`non-idempotent: ${m[0]}`)
    expect(MIGRATION).not.toMatch(/DROP CONSTRAINT/)
    for (const m of MIGRATION.matchAll(/ADD CONSTRAINT (\w+)/g)) {
      expect(MIGRATION).toContain(`WHERE conname = '${m[1]}'`)
    }
  })

  it('defaults the advert OFF per unit in the migration and schema.sql', () => {
    expect(MIGRATION).toContain('advertise_while_occupied BOOLEAN NOT NULL DEFAULT FALSE')
    expect(SCHEMA).toContain('advertise_while_occupied BOOLEAN NOT NULL DEFAULT FALSE')
    expect(SCHEMA).toContain('CREATE TABLE tenant_viewing_windows')
    expect(SCHEMA).toContain('notice_end_date')
    expect(SCHEMA).toContain('tenant_proposed_starts_at')
  })
})
