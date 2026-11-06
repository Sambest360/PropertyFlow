import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * T2 (spec r4) wiring in the listing wizard page. The rules live in
 * propertyWizardDraft.ts / listingSizes.ts (tested there); this pins that the
 * page uses them, in the same source-scan style as useWizardDraft.test.ts.
 */
const src = readFileSync('src/pages/property/PropertyCreatePage.tsx', 'utf8')
const submit = src.slice(src.indexOf('async function submitProperty'), src.indexOf('const err = validateStep(6)', src.indexOf('async function submitProperty')))

describe('PropertyCreatePage T2 wiring', () => {
  it('has no default type and blocks submit without one', () => {
    expect(src).not.toMatch(/propertyType:\s*'Apartment'/)
    expect(src).toContain('propertyType: INITIAL_WIZARD_PROPERTY_TYPE')
    expect(src).toMatch(/case 0:\s*return wizardTypeError\(draft\.propertyType/)
    // Submit itself re-checks the type (and the rooms step) before any save.
    expect(submit).toMatch(/const typeErr = validateStep\(0\) \?\? validateStep\(3\)\s*if \(typeErr\) \{[\s\S]{0,160}return\s*\}/)
  })

  it('offers Industrial and Farm, also over an older stored type list', () => {
    expect(src).toContain("{ value: 'Industrial', label: 'Industrial', icon: Warehouse }")
    expect(src).toContain("{ value: 'Farm', label: 'Farm'")
    expect(src).toContain('wizardTypeOptions(propertyTypes, knownKeys)')
  })

  it('saves exactly the rooms entered (0 beds stays 0) and the rooms step allows none', () => {
    expect(src).not.toMatch(/draft\.rooms\.length > 0 \? draft\.rooms : defaultRooms\(\)/)
    expect(src).toContain('wizardRoomRowsForSave(draft.rooms)')
    expect(src).toMatch(/case 3:[\s\S]{0,120}return wizardRoomsStepError\(draft\)/)
    expect(src).not.toContain("'Add at least one room.'")
    expect(src).not.toContain("'Enter the erf size in m².'")
  })

  it('has separate floor and erf inputs, erf disabled until 037 is applied', () => {
    expect(src).toContain('{FLOOR_SIZE_LABEL}')
    expect(src).toContain('{ERF_SIZE_LABEL}')
    expect(src).toContain('{erfField.hint ?? ERF_SIZE_HINT}')
    expect(src).toContain('disabled={erfField.disabled}')
    expect(src).toContain('...wizardSizesForSave(draft, { erfSupported })')
    expect(src).toContain('effectiveFloorSizeSqm(draft.floorSizeSqm, draft.rooms)')
  })

  it('warns (does not block) on a title that contradicts the type', () => {
    expect(src).toContain('titleTypeWarning(draft.title, draft.propertyType)')
  })
})

describe('Kelly PR A: wizard rooms start empty; House replaces blank-type starters; publish dialog', () => {
  it('T5: starts a new draft with rooms: [] (no apartment starters planted)', () => {
    expect(src).toMatch(/rooms:\s*\[\]/)
    expect(src).not.toMatch(/rooms:\s*defaultRooms\(\)/)
  })
  it('T5: blank type + untouched rooms uses shouldReplaceStarterRooms so House is not skipped as the same family', () => {
    expect(src).toContain('shouldReplaceStarterRooms')
    expect(src).not.toMatch(/if \(prevFamily === typeLayout\.family\) return/)
  })
  it('T6-ui: publish opens a Change type / Publish anyway dialog; draft keeps the yellow warning only', () => {
    expect(src).toContain('titleTypeConfirmPrompt')
    expect(src).toContain('sweetTitleTypeConfirm')
    // The draft banner still uses titleTypeWarning (never blocks a draft save).
    expect(src).toContain('titleTypeWarning(draft.title, draft.propertyType)')
    const submit = src.slice(src.indexOf('async function submitProperty'))
    expect(submit).toMatch(/titleTypeConfirmPrompt/)
    expect(submit).toMatch(/sweetTitleTypeConfirm/)
    expect(submit).toContain('willPublish')
    expect(submit).toMatch(/goTo\(0\)/)
    expect(submit).toMatch(/titleTypeConfirmed:\s*true/)
  })
})


describe('Kelly PR A: inferred-edit type picker (AV3-3, AV3-14)', () => {
  it('AV3-3: an empty picker does not submit a type', () => {
    const patch = src.slice(src.indexOf('function buildPropertyPatch'))
    expect(patch).toMatch(/type:\s*draft\.propertyType\.trim\(\)\s*\?\s*draft\.propertyType\s*:\s*undefined/)
    expect(patch).not.toMatch(/type:\s*draft\.propertyType\s*,/)
  })
  it('AV3-3: wizardTypeError allows a blank type on an inferred edit', () => {
    expect(src).toMatch(/wizardTypeError\(draft\.propertyType/)
    expect(src).toMatch(/allowBlank:/)
  })
  it('AV3-14: shows muted Suggested from title hint for an inferred listing, not a stored type', () => {
    expect(src).toContain('suggestedTypeFromTitleHint')
    expect(src).toContain('Suggested from title:')
    expect(src).toContain('value={draft.propertyType}')
    expect(src).not.toMatch(/value=\{suggestedTypeFromTitleHint/)
    expect(src).not.toMatch(/value=\{editProperty\?\.type/)
  })
})
