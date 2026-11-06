import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { suggestedTypeFromTitleHint, wizardTypeError } from './propertyWizardDraft'

const src = readFileSync(new URL('./propertyWizardDraft.ts', import.meta.url), 'utf8')

describe('AV3-3: draftFromProperty does not prefill an inferred type', () => {
  it('hydrates an inferred listing with a blank picker value', () => {
    const fn = src.slice(src.indexOf('export function draftFromProperty'))
    expect(fn).toMatch(/propertyType:\s*property\.typeInferred\s*\?\s*(INITIAL_WIZARD_PROPERTY_TYPE|['"]{2})/)
    expect(fn).not.toMatch(/propertyType:\s*property\.type\s*,/)
  })
})

describe('AV3-3: wizardTypeError allowBlank', () => {
  it('lets an inferred edit save other fields without picking a type', () => {
    expect(wizardTypeError('', { allowBlank: true })).toBeNull()
    expect(wizardTypeError('   ', { allowBlank: true })).toBeNull()
    expect(wizardTypeError('')).toBe('Select a property type.')
    expect(wizardTypeError('', { allowBlank: false })).toBe('Select a property type.')
    expect(wizardTypeError('House', { allowBlank: true })).toBeNull()
  })
})

describe('AV3-14: suggestedTypeFromTitleHint is display-only', () => {
  it('renders for an inferred listing and not for one with a stored type', () => {
    expect(suggestedTypeFromTitleHint({ type: 'House', typeInferred: true }, '')).toBe('Suggested from title: House')
    expect(suggestedTypeFromTitleHint({ type: 'Apartment', typeInferred: false }, '')).toBeNull()
    expect(suggestedTypeFromTitleHint({ type: 'House', typeInferred: true }, 'Industrial')).toBeNull()
    expect(suggestedTypeFromTitleHint({ type: '', typeInferred: true }, '')).toBeNull()
    expect(suggestedTypeFromTitleHint(null, '')).toBeNull()
  })
  it('never writes the hint into draft.propertyType (mutant: prefill picker from hint)', () => {
    const fn = src.slice(src.indexOf('export function draftFromProperty'))
    expect(fn).not.toMatch(/propertyType:\s*property\.type\s*,/)
    expect(fn).not.toContain('suggestedTypeFromTitleHint')
  })
})
