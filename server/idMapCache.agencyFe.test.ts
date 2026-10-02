import { describe, expect, it } from 'vitest'
import { feAgencyFromCache, type IdMapCache } from './idMapCache.js'
import { CLIENT_TO_AGENCY } from './idMap.js'

function emptyCache(overrides?: Partial<IdMapCache>): IdMapCache {
  return {
    userBackendToFe: new Map(),
    unitBackendToPropertyFe: new Map(),
    agencyBackendToFe: new Map(),
    ...overrides,
  }
}

describe('feAgencyFromCache (P0 r20 agency FE parity)', () => {
  it('maps UUID client_id via agencyBackendToFe to FE agency', () => {
    const uuid = '7515d803-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const cache = emptyCache({
      agencyBackendToFe: new Map([[uuid, 'ag-rhtxlh']]),
    })
    expect(feAgencyFromCache(cache, uuid)).toBe('ag-rhtxlh')
  })

  it('falls back to seed CLIENT_TO_AGENCY when entity_id_map misses', () => {
    const seedUuid = Object.keys(CLIENT_TO_AGENCY)[0]
    if (!seedUuid) return
    const cache = emptyCache()
    expect(feAgencyFromCache(cache, seedUuid)).toBe(CLIENT_TO_AGENCY[seedUuid])
  })

  it('passthrough FE agency id and null', () => {
    const cache = emptyCache()
    expect(feAgencyFromCache(cache, 'ag-rhtxlh')).toBe('ag-rhtxlh')
    expect(feAgencyFromCache(cache, null)).toBeNull()
    expect(feAgencyFromCache(cache, undefined)).toBeNull()
  })

  it('prefers entity_id_map over seed map when both exist', () => {
    const seedUuid = Object.keys(CLIENT_TO_AGENCY)[0]
    if (!seedUuid) return
    const cache = emptyCache({
      agencyBackendToFe: new Map([[seedUuid, 'ag-override']]),
    })
    expect(feAgencyFromCache(cache, seedUuid)).toBe('ag-override')
  })
})
