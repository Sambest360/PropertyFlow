import type { PropertyWizardDraft } from './propertyWizardDraft'
import type { PropertyAsset } from '../types/domain'

export function shouldRetainWizardDraftPropertyId(
  draft: Pick<PropertyWizardDraft, 'draftPropertyId' | 'resumeDraftPropertyId' | 'agencyId'>,
  properties: Pick<PropertyAsset, 'id' | 'status' | 'agencyId'>[],
): boolean {
  const resumeId = draft.resumeDraftPropertyId?.trim()
  const draftId = draft.draftPropertyId?.trim()
  if (!resumeId || !draftId || resumeId !== draftId) return false
  const row = properties.find((p) => p.id === resumeId)
  if (!row) return false
  if (row.status !== 'Draft') return false
  if (draft.agencyId && row.agencyId !== draft.agencyId) return false
  return true
}
