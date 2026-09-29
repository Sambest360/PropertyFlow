import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LOCAL_DEV_PASSWORD,
  localDevAgencies,
  localDevRoles,
  localDevSeed,
  localDevUsers,
  renderLocalDevSeedSql,
} from '../../database/fixtures/localDevSeed.ts'

describe('local dev fixture', () => {
  it('exports a stable shape with fixed ids, emails, and one shared password', () => {
    expect(localDevSeed.password).toBe(LOCAL_DEV_PASSWORD)
    expect(localDevSeed.roles).toEqual([...localDevRoles])
    expect(localDevSeed.agencies).toHaveLength(2)
    expect(localDevSeed.users.length).toBe(1 + 2 * 8)
    for (const user of localDevSeed.users) {
      expect(user.email.endsWith('@example.test')).toBe(true)
      expect(user.password).toBe(LOCAL_DEV_PASSWORD)
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

  it('keeps supabase/seed.sql identical to the renderer', () => {
    const sql = renderLocalDevSeedSql()
    expect(readFileSync('supabase/seed.sql', 'utf8')).toBe(sql)
    for (const user of localDevUsers) {
      expect(sql).toContain(user.email)
      expect(sql).toContain(user.userId)
    }
  })
})