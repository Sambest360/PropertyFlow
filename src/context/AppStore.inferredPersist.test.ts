import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const store = readFileSync(new URL('./AppStore.tsx', import.meta.url), 'utf8')

function slice(start: string, end: string): string {
  const i = store.indexOf(start)
  expect(i, `missing ${start}`).toBeGreaterThan(-1)
  const j = store.indexOf(end, i + start.length)
  expect(j, `missing ${end}`).toBeGreaterThan(i)
  return store.slice(i, j)
}

const usesHelper = /propertyPersistPayload\s*\(/

describe('CR-4: inferred prev.type must not ride along on property writes', () => {
  it('updateProperty persist omits inferred prev.type (same rule as publishProperty)', () => {
    const body = slice('updateProperty: (id, p) => {', 'assignPropertyAgent:')
    const marker = "persistUpsert('property'"
    const i = body.lastIndexOf(marker)
    expect(i, 'missing updateProperty property persist').toBeGreaterThan(-1)
    const persist = body.slice(i, i + 160)
    expect(persist).toMatch(usesHelper)
    expect(persist).not.toMatch(/\{ \.\.\.prev, \.\.\.p, id \}/)
  })

  it('assignPropertyAgent persist omits inferred prev.type', () => {
    const body = slice('assignPropertyAgent: async (id, agentId) => {', 'setPropertyRooms:')
    expect(body).toMatch(/persistUpsertResult\(\s*'property'/)
    expect(body).toMatch(usesHelper)
    expect(body).not.toMatch(/\{ \.\.\.prev, agentId: next, id \}/)
  })

  it('setPropertyRooms persist omits inferred prev.type', () => {
    const body = slice('setPropertyRooms: (id, rooms) => {', 'publishProperty:')
    const marker = "persistUpsert('property'"
    const i = body.indexOf(marker)
    expect(i, 'missing setPropertyRooms property persist').toBeGreaterThan(-1)
    const persist = body.slice(i, i + 160)
    expect(persist).toMatch(usesHelper)
    expect(persist).not.toMatch(/\{ \.\.\.prev, rooms, beds, baths \}/)
  })

  it('application-approve property persist omits inferred prev.type', () => {
    const i = store.indexOf('propertyPersistPayload(prop,')
    expect(i, 'missing application-approve propertyPersistPayload').toBeGreaterThan(-1)
    const snippet = store.slice(Math.max(0, i - 80), i + 200)
    expect(snippet).toMatch(/persistUpsert\(/)
    expect(snippet).toMatch(/status:\s*app\.type === 'Rental'/)
    expect(snippet).not.toMatch(/\{\s*\.\.\.prop,\s*status:/)
  })

  it('keys-handover property persist omits inferred prev.type', () => {
    const i = store.indexOf('propertyPersistPayload(updatedProp)')
    expect(i, 'missing keys-handover propertyPersistPayload').toBeGreaterThan(-1)
    const snippet = store.slice(Math.max(0, i - 80), i + 80)
    expect(snippet).toMatch(/persistUpsert\(/)
    expect(snippet).not.toMatch(/updatedProp as unknown as Record/)
  })
})
