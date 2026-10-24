import { describe, expect, it } from 'vitest'
import {
  countUnopened,
  emptyOpenedStore,
  isUnopenedIn,
  markOpenedIn,
  parseOpenedStore,
  seedOpened,
  type UnopenedKind,
} from './unopened'

const ids = (over: Partial<Record<UnopenedKind, string[]>> = {}): Record<UnopenedKind, string[]> => ({
  lead: [],
  application: [],
  viewing: [],
  payment: [],
  ticket: [],
  ...over,
})

describe('unopened tracking', () => {
  it('shows nothing before the first seed (data not loaded yet)', () => {
    expect(isUnopenedIn(emptyOpenedStore(), 'lead', 'l1')).toBe(false)
  })

  it('treats rows present at the first seed as opened and later rows as unopened', () => {
    const store = seedOpened(emptyOpenedStore(), ids({ lead: ['l1'] }))
    expect(isUnopenedIn(store, 'lead', 'l1')).toBe(false)
    expect(isUnopenedIn(store, 'lead', 'l2')).toBe(true)
    expect(countUnopened(store, 'lead', ['l1', 'l2', 'l3'])).toBe(2)
  })

  it('opening an item clears it; seeding again does not re-seed a tracked kind', () => {
    let store = seedOpened(emptyOpenedStore(), ids({ payment: ['p1'] }))
    store = markOpenedIn(store, 'payment', 'p2')
    expect(isUnopenedIn(store, 'payment', 'p2')).toBe(false)
    const again = seedOpened(store, ids({ payment: ['p3'] }))
    expect(again).toBe(store)
    expect(isUnopenedIn(again, 'payment', 'p3')).toBe(true)
  })

  it('keeps kinds separate and survives a storage round-trip', () => {
    const store = markOpenedIn(seedOpened(emptyOpenedStore(), ids()), 'lead', 'x')
    const loaded = parseOpenedStore(JSON.stringify(store))
    expect(isUnopenedIn(loaded, 'lead', 'x')).toBe(false)
    expect(isUnopenedIn(loaded, 'ticket', 'x')).toBe(true)
    expect(parseOpenedStore('not json')).toEqual(emptyOpenedStore())
  })
})
