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

/**
 * Add property opens empty unless the user explicitly saved a draft
 * ("Save" → server draft, resumeDraftPropertyId === draftPropertyId) or this
 * is the same history entry as before (a page refresh mid-wizard keeps the
 * auto-saved progress). A fresh click on Add property gets a new history
 * entry, so leftover unsaved input from an earlier visit is discarded.
 */
export function shouldStartFreshWizard(params: {
  storedDraft: Pick<PropertyWizardDraft, 'draftPropertyId' | 'resumeDraftPropertyId'> | null
  entryKey: string
  lastEntryKey: string | null
}): boolean {
  const { storedDraft, entryKey, lastEntryKey } = params
  if (!storedDraft) return false
  // A saved draft lives on the server and reopens from the Properties list;
  // a new visit to "Add property" always starts empty.
  return entryKey !== lastEntryKey
}
