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
const omitsInferredType = /typeInferred\s*\?\s*\{\s*\}|prevTypeInferred\s*\?\s*\{\s*\}|propertyPersistPayload\s*\(/

describe('CR-4: inferred prev.type must not ride along on property writes', () => {
  it('updateProperty persist omits inferred prev.type (same rule as publishProperty)', () => {
    const body = slice('updateProperty: (id, p) => {', 'assignPropertyAgent:')
    const marker = "persistUpsert('property'"
    const i = body.lastIndexOf(marker)
    expect(i, 'missing updateProperty property persist').toBeGreaterThan(-1)
    const persist = body.slice(i)
    expect(persist).toMatch(omitsInferredType)
    expect(persist).not.toMatch(/\{ \.\.\.prev, \.\.\.p, id \}/)
  })

  it('assignPropertyAgent persist omits inferred prev.type', () => {
    const body = slice('assignPropertyAgent: async (id, agentId) => {', 'setPropertyRooms:')
    expect(body).toMatch(/persistUpsertResult\(\s*'property'/)
    expect(body).toMatch(omitsInferredType)
    expect(body).not.toMatch(/\{ \.\.\.prev, agentId: next, id \}/)
  })

  it('setPropertyRooms persist omits inferred prev.type', () => {
    const body = slice('setPropertyRooms: (id, rooms) => {', 'publishProperty:')
    expect(body).toMatch(/persistUpsert\(\s*'property'/)
    expect(body).toMatch(omitsInferredType)
    expect(body).not.toMatch(/\{ \.\.\.prev, rooms, beds, baths \}/)
  })

  it('application-approve property persist omits inferred prev.type', () => {
    // The approve path spreads {...prop, status} today; F4 requires the shared helper.
    const i = store.indexOf("persistUpsert('property', prop.id,")
    expect(i, 'missing application-approve property persist').toBeGreaterThan(-1)
    const snippet = store.slice(i, i + 220)
    expect(snippet).toMatch(usesHelper)
    expect(snippet).not.toMatch(/\{\s*\.\.\.prop,\s*status:/)
  })

  it('keys-handover property persist omits inferred prev.type', () => {
    const i = store.indexOf("persistUpsert('property', updatedProp.id,")
    expect(i, 'missing keys-handover property persist').toBeGreaterThan(-1)
    const snippet = store.slice(i, i + 180)
    expect(snippet).toMatch(usesHelper)
    expect(snippet).not.toMatch(/updatedProp as unknown as Record/)
  })
})
