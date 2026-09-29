import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  localDevAgencies,
  localDevRoles,
  localDevSeed,
  localDevUsers,
  renderLocalDevSeedSql,
  SEED_PASSWORD_ENV_VAR,
  uploadPersonas,
} from '../../database/fixtures/localDevSeed.ts'

const STAFF_ROLES = new Set(['client_admin', 'agent_admin', 'ground_agent', 'agent'])

describe('local dev fixture', () => {
  it('exports a stable shape with fixed ids and @example.test emails', () => {
    expect(localDevSeed.seedPasswordEnvVar).toBe(SEED_PASSWORD_ENV_VAR)
    expect(localDevSeed.roles).toEqual([...localDevRoles])
    expect(localDevSeed.agencies).toHaveLength(2)
    expect(localDevSeed.users.length).toBe(1 + 2 * 8)
    for (const user of localDevSeed.users) {
      expect(user.email.endsWith('@example.test')).toBe(true)
      expect(user.authUserId).toMatch(/^[0-9a-f-]{36}$/)
      expect(user.userId).toMatch(/^[0-9a-f-]{36}$/)
    }
  })

  it('includes every role in each agency, plus one platform super admin', () => {
    const supers = localDevUsers.filter((user) => user.role === 'super_admin')
    expect(supers).toHaveLength(1)
    expect(supers[0]?.agencyId).toBeNull()
    for (const agency of localDevAgencies) {
      const roles = localDevUsers.filter((user) => user.agencyId === agency.id).map((user) => user.role)
      expect(roles.sort()).toEqual(
        [
          'agent',
          'agent_admin',
          'applicant',
          'client_admin',
          'contractor',
          'ground_agent',
          'landlord',
          'tenant',
        ].sort(),
      )
    }
  })

  it('exports a tenant with a ticket and an applicant who is not staff', () => {
    const tenant = uploadPersonas.tenantWithMaintenanceTicket
    const applicant = uploadPersonas.applicantWithApplication
    expect(tenant.user.role).toBe('tenant')
    expect(tenant.staffOfAgency).toBe(false)
    expect(STAFF_ROLES.has(tenant.user.role)).toBe(false)
    expect(tenant.ticket.id).toBe(tenant.agency.ticket.id)
    expect(tenant.user.email).toBe('finn.ledger@example.test')

    expect(applicant.user.role).toBe('applicant')
    expect(applicant.staffOfAgency).toBe(false)
    expect(STAFF_ROLES.has(applicant.user.role)).toBe(false)
    expect(applicant.application.id).toBe(applicant.agency.application.id)
    expect(applicant.user.agencyId).toBe(applicant.agency.id)
    expect(applicant.user.email).toBe('hal.ledger@example.test')
    expect(localDevSeed.uploadPersonas).toBe(uploadPersonas)
  })

  it('keeps supabase/seed.sql identical to the renderer and free of a literal password', () => {
    const sql = renderLocalDevSeedSql()
    expect(readFileSync('supabase/seed.sql', 'utf8')).toBe(sql)
    expect(sql).not.toMatch(/crypt\(\s*'/)
    expect(sql).toContain('encode(gen_random_bytes(32), \'hex\')')
    for (const user of localDevUsers) {
      expect(sql).toContain(user.email)
      expect(sql).toContain(user.userId)
    }
  })
})