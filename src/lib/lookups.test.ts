import { describe, expect, it } from 'vitest'
import { getLookups, isGlobalLookup } from './lookups'
import { GLOBAL_CLIENT_ID } from '../data/platformLookups'
import type { LookupConfig } from '../data/infrastructure'

function row(
  partial: Pick<LookupConfig, 'id' | 'clientId' | 'keyValue' | 'displayLabel'> &
    Partial<LookupConfig>,
): LookupConfig {
  return {
    configType: 'PROPERTY_STATUS',
    sortOrder: 0,
    isActive: true,
    ...partial,
  }
}

describe('getLookups scoping', () => {
  const rows: LookupConfig[] = [
    row({
      id: 'g1',
      clientId: GLOBAL_CLIENT_ID,
      keyValue: 'AVAILABLE',
      displayLabel: 'Available',
      sortOrder: 1,
    }),
    row({
      id: 'g2',
      clientId: GLOBAL_CLIENT_ID,
      keyValue: 'RENTED',
      displayLabel: 'Rented',
      sortOrder: 2,
    }),
    row({
      id: 'a1',
      clientId: 'ag-a',
      keyValue: 'AVAILABLE',
      displayLabel: 'On market',
      sortOrder: 1,
    }),
    row({
      id: 'a2',
      clientId: 'ag-a',
      keyValue: 'HOLD',
      displayLabel: 'On hold',
      sortOrder: 3,
      isActive: false,
    }),
    row({
      id: 'b1',
      clientId: 'ag-b',
      keyValue: 'AVAILABLE',
      displayLabel: 'Agency B available',
      sortOrder: 1,
    }),
  ]

  it('merges global ∪ agency with agency label overrides', () => {
    const merged = getLookups(rows, 'ag-a', 'PROPERTY_STATUS')
    expect(merged.map((r) => r.keyValue).sort()).toEqual(['AVAILABLE', 'RENTED'])
    expect(merged.find((r) => r.keyValue === 'AVAILABLE')?.displayLabel).toBe('On market')
    expect(merged.find((r) => r.keyValue === 'RENTED')?.displayLabel).toBe('Rented')
  })

  it('does not leak another agency’s overrides into the merge', () => {
    const merged = getLookups(rows, 'ag-a', 'PROPERTY_STATUS')
    expect(merged.some((r) => r.displayLabel === 'Agency B available')).toBe(false)
  })

  it('scopeOnly agency excludes globals and can include inactive', () => {
    const agencyOnly = getLookups(rows, 'ag-a', 'PROPERTY_STATUS', {
      scopeOnly: 'agency',
      includeInactive: true,
    })
    expect(agencyOnly.every((r) => r.clientId === 'ag-a')).toBe(true)
    expect(agencyOnly.some((r) => r.keyValue === 'HOLD')).toBe(true)
  })

  it('treats missing agency id as global-only', () => {
    const globals = getLookups(rows, null, 'PROPERTY_STATUS')
    expect(globals.every((r) => isGlobalLookup(r.clientId))).toBe(true)
  })
})
