import { describe, expect, it } from 'vitest'
import { preferServerPersistForApplication } from './persist'

describe('preferServerPersistForApplication', () => {
  it('routes application upserts through /api/persist (DATABASE_URL) first', () => {
    expect(preferServerPersistForApplication('application', 'upsert')).toBe(true)
  })

  it('does not force other resources onto the server path', () => {
    expect(preferServerPersistForApplication('application', 'delete')).toBe(false)
    expect(preferServerPersistForApplication('lead', 'upsert')).toBe(false)
    expect(preferServerPersistForApplication('tenancy', 'upsert')).toBe(false)
  })
})
