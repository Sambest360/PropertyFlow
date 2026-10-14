import { describe, expect, it } from 'vitest'
import {
  LOCAL_WRITE_TTL_MS,
  markLocalPersistWrite,
  mergeEntityLists,
  resetLocalPersistWrites,
} from './bootstrapMerge'

describe('mergeEntityLists', () => {
  it('prefers recently persisted local rows over stale remote data', () => {
    resetLocalPersistWrites()
    const now = Date.now()
    markLocalPersistWrite('property', 'p1')

    const local = [{ id: 'p1', status: 'Published' }]
    const remote = [{ id: 'p1', status: 'Draft' }]

    const merged = mergeEntityLists(local, remote, 'properties', {
      now,
      ttlMs: LOCAL_WRITE_TTL_MS,
    })

    expect(merged).toEqual([{ id: 'p1', status: 'Published' }])
  })

  it('uses remote data once the local write window expires', () => {
    resetLocalPersistWrites()
    const writtenAt = Date.now()
    markLocalPersistWrite('property', 'p1')

    const local = [{ id: 'p1', status: 'Published' }]
    const remote = [{ id: 'p1', status: 'Draft' }]

    const merged = mergeEntityLists(local, remote, 'properties', {
      now: writtenAt + LOCAL_WRITE_TTL_MS + 1,
      ttlMs: LOCAL_WRITE_TTL_MS,
    })

    expect(merged).toEqual([{ id: 'p1', status: 'Draft' }])
  })

  it('drops local-only rows in scoped replace mode unless recently written', () => {
    resetLocalPersistWrites()
    const now = 2_000_000
    const local = [
      { id: 'p1', status: 'Draft' },
      { id: 'p2', status: 'Published' },
    ]
    const remote = [{ id: 'p1', status: 'Draft' }]

    const merged = mergeEntityLists(local, remote, 'properties', {
      now,
      replaceWhenMissing: true,
    })

    expect(merged).toEqual([{ id: 'p1', status: 'Draft' }])
  })

  it('keeps a recently created agency when bootstrap snapshot omits it', () => {
    resetLocalPersistWrites()
    const now = 4_000_000
    markLocalPersistWrite('agency', 'ag-new')

    const local = [{ id: 'ag-new', name: 'New Co' }]
    const remote = [{ id: 'ag-horizon', name: 'Horizon' }]

    const merged = mergeEntityLists(local, remote, 'agencies', { now })
    expect(merged).toEqual(
      expect.arrayContaining([
        { id: 'ag-horizon', name: 'Horizon' },
        { id: 'ag-new', name: 'New Co' },
      ]),
    )
  })

  it('keeps recently written local-only rows in scoped replace mode', () => {
    resetLocalPersistWrites()
    const now = 3_000_000
    markLocalPersistWrite('property', 'p2')

    const local = [{ id: 'p2', status: 'Published' }]
    const remote = [{ id: 'p1', status: 'Draft' }]

    const merged = mergeEntityLists(local, remote, 'properties', {
      now,
      replaceWhenMissing: true,
    })

    expect(merged).toEqual([
      { id: 'p1', status: 'Draft' },
      { id: 'p2', status: 'Published' },
    ])
  })
})
