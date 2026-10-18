import { describe, expect, it } from 'vitest'
import { shouldRetainWizardDraftPropertyId } from './propertyWizardResume'

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
