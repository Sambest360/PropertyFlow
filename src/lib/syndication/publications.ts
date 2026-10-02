/**
 * Listing publication state transitions for Mode A manual pack workflow.
 */

import type { PropertyAsset } from '../../types/domain'
import { buildCanonicalListing } from './completeness'
import { ManualExportAdapter, RefuseClosedPartnerAdapter } from './adapters'
import { payloadHashForCanonical } from './adapters'
import type {
  ExportPack,
  ListingPublication,
  ListingPublicationStatus,
  PortalCode,
} from './types'

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function listPublications(property: PropertyAsset): ListingPublication[] {
  return property.syndicationPublications ?? []
}

export function findPublication(
  property: PropertyAsset,
  portalCode: PortalCode,
): ListingPublication | undefined {
  return listPublications(property).find((p) => p.portalCode === portalCode)
}

export type ManualExportActionResult =
  | {
      ok: true
      property: PropertyAsset
      publication: ListingPublication
      exportPack: ExportPack
      mandateSoftWarn: string | null
    }
  | { ok: false; error: string; property: PropertyAsset }

/**
 * Generate manual export pack and mark publication `exported_manual`.
 * Does not call live portals. Mandate incomplete → soft-warn only.
 */
export async function exportManualPackForPortal(
  property: PropertyAsset,
  portalCode: Extract<PortalCode, 'property24' | 'private_property'>,
  opts: { at?: string } = {},
): Promise<ManualExportActionResult> {
  const adapter = new ManualExportAdapter(portalCode)
  const canonical = buildCanonicalListing(property, portalCode)
  const result = await adapter.upsertListing(canonical)
  if (!result.ok || !result.exportPack) {
    return {
      ok: false,
      error: result.error ?? 'Manual export failed',
      property,
    }
  }
  const at = opts.at ?? result.exportPack.generatedAt
  const hash = payloadHashForCanonical(canonical)
  const existing = findPublication(property, portalCode)
  const publication: ListingPublication = {
    id: existing?.id ?? uid('pub'),
    propertyId: property.id,
    unitId: property.unitId ?? null,
    portalCode,
    status: 'exported_manual',
    externalListingId: existing?.externalListingId ?? null,
    liveUrl: existing?.liveUrl ?? null,
    lastError: null,
    lastPayloadHash: hash,
    exportedAt: at,
    liveManualAt: existing?.liveManualAt ?? null,
    unpublishedAt: null,
  }
  const others = listPublications(property).filter((p) => p.portalCode !== portalCode)
  const next: PropertyAsset = {
    ...property,
    syndicationPublications: [...others, publication],
  }
  const mandateSoftWarn = canonical.mandateActive
    ? null
    : 'Mandate not marked active — soft warning only (Mode A). Export pack still allowed; live partner push is refuse-closed anyway.'
  return { ok: true, property: next, publication, exportPack: result.exportPack, mandateSoftWarn }
}

/**
 * Staff confirms they pasted the pack onto the portal → `live_manual`.
 */
export function markPublicationLiveManual(
  property: PropertyAsset,
  portalCode: PortalCode,
  opts: { liveUrl?: string | null; at?: string } = {},
): ManualExportActionResult {
  const existing = findPublication(property, portalCode)
  if (!existing || (existing.status !== 'exported_manual' && existing.status !== 'live_manual')) {
    return {
      ok: false,
      error: 'Export a manual pack first, then mark live_manual after pasting on the portal.',
      property,
    }
  }
  const at = opts.at ?? new Date().toISOString()
  const publication: ListingPublication = {
    ...existing,
    status: 'live_manual',
    liveManualAt: at,
    liveUrl: opts.liveUrl ?? existing.liveUrl ?? null,
    lastError: null,
  }
  const others = listPublications(property).filter((p) => p.portalCode !== portalCode)
  return {
    ok: true,
    property: {
      ...property,
      syndicationPublications: [...others, publication],
    },
    publication,
    exportPack: {
      portalCode,
      format: 'json_csv',
      filenameBase: 'noop',
      json: '',
      csv: '',
      generatedAt: at,
      honestyLabel: 'already exported',
    },
    mandateSoftWarn: null,
  }
}

/** Attempt live partner push — always refuse-closed in Mode A. */
export async function attemptLivePartnerPush(
  property: PropertyAsset,
  portalCode: Extract<PortalCode, 'property24' | 'private_property'>,
): Promise<{ ok: false; error: string; status: ListingPublicationStatus }> {
  const adapter = new RefuseClosedPartnerAdapter(portalCode, { configured: false })
  const canonical = buildCanonicalListing(property, portalCode)
  const result = await adapter.upsertListing(canonical)
  return {
    ok: false,
    error: result.error ?? 'Partner adapter refused',
    status: 'error',
  }
}

export function publicationStatusLabel(status: ListingPublicationStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft'
    case 'ready':
      return 'Ready'
    case 'exported_manual':
      return 'Exported (manual pack)'
    case 'live_manual':
      return 'Live (manual on portal)'
    case 'error':
      return 'Error'
    case 'unpublished':
      return 'Unpublished'
    default:
      return status
  }
}
