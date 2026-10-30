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
    expect(src).toMatch(/case 0:\s*return wizardTypeError\(draft\.propertyType\)/)
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
