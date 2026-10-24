import { describe, expect, it } from 'vitest'
import { isRawUuid, normalizePropertyRefs, propertyRefLabel, UNKNOWN_PROPERTY_LABEL } from './propertyRefs'

const UNIT_UUID = '7eb09e47-bc24-498e-a51e-411fae8f7465'

describe('normalizePropertyRefs', () => {
  const properties = [{ id: 'PR-C21-CT02', backendId: UNIT_UUID, title: 'Sea view flat' }]

  it('maps rows that reference a property by its database UUID', () => {
    const state = { properties, leads: [{ id: 'l1', propertyId: UNIT_UUID }] }
    expect(normalizePropertyRefs(state).leads[0].propertyId).toBe('PR-C21-CT02')
  })

  it('leaves matching and unknown references untouched and keeps array identity', () => {
    const leads = [{ id: 'l1', propertyId: 'PR-C21-CT02' }]
    const applications = [{ id: 'a1', propertyId: 'b0000000-0000-4000-8000-000000000000' }]
    const state = { properties, leads, applications }
    const out = normalizePropertyRefs(state)
    expect(out).toBe(state)
    expect(out.leads).toBe(leads)
    expect(out.applications).toBe(applications)
  })
})

describe('propertyRefLabel', () => {
  it('hides raw UUIDs and keeps readable listing codes', () => {
    expect(isRawUuid(UNIT_UUID)).toBe(true)
    expect(propertyRefLabel(UNIT_UUID)).toBe(UNKNOWN_PROPERTY_LABEL)
    expect(propertyRefLabel('PR-C21-CT02')).toBe('PR-C21-CT02')
    expect(propertyRefLabel('')).toBe('—')
  })
})
