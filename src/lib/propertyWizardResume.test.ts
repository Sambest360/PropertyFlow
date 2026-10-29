import { describe, expect, it } from 'vitest'
import { shouldRetainWizardDraftPropertyId, shouldStartFreshWizard } from './propertyWizardResume'

const props = [
  { id: 'unt-own', status: 'Draft' as const, agencyId: 'ag-a' },
  { id: 'unt-live', status: 'Published' as const, agencyId: 'ag-a' },
  { id: 'unt-other', status: 'Draft' as const, agencyId: 'ag-b' },
]

describe('shouldRetainWizardDraftPropertyId', () => {
  it('keeps id when resume marker matches own draft in agency', () => {
    expect(
      shouldRetainWizardDraftPropertyId(
        { draftPropertyId: 'unt-own', resumeDraftPropertyId: 'unt-own', agencyId: 'ag-a' },
        props,
      ),
    ).toBe(true)
  })

  it('clears stale id without resume marker', () => {
    expect(
      shouldRetainWizardDraftPropertyId(
        { draftPropertyId: 'unt-own', resumeDraftPropertyId: '', agencyId: 'ag-a' },
        props,
      ),
    ).toBe(false)
  })

  it('clears published listing id even with resume marker', () => {
    expect(
      shouldRetainWizardDraftPropertyId(
        { draftPropertyId: 'unt-live', resumeDraftPropertyId: 'unt-live', agencyId: 'ag-a' },
        props,
      ),
    ).toBe(false)
  })

  it('clears wrong-agency draft', () => {
    expect(
      shouldRetainWizardDraftPropertyId(
        { draftPropertyId: 'unt-other', resumeDraftPropertyId: 'unt-other', agencyId: 'ag-a' },
        props,
      ),
    ).toBe(false)
  })
})

describe('shouldStartFreshWizard', () => {
  const unsaved = { draftPropertyId: '', resumeDraftPropertyId: '' }

  it('clears unsaved leftovers on a new visit to Add property', () => {
    expect(shouldStartFreshWizard({ storedDraft: unsaved, entryKey: 'k2', lastEntryKey: 'k1' })).toBe(true)
  })

  it('keeps progress on a refresh of the same visit', () => {
    expect(shouldStartFreshWizard({ storedDraft: unsaved, entryKey: 'k1', lastEntryKey: 'k1' })).toBe(false)
  })

  it('starts empty after a saved draft too (the draft reopens from the list)', () => {
    const saved = { draftPropertyId: 'unt-1', resumeDraftPropertyId: 'unt-1' }
    expect(shouldStartFreshWizard({ storedDraft: saved, entryKey: 'k2', lastEntryKey: 'k1' })).toBe(true)
  })

  it('has nothing to clear without a stored draft', () => {
    expect(shouldStartFreshWizard({ storedDraft: null, entryKey: 'k2', lastEntryKey: null })).toBe(false)
  })
})
