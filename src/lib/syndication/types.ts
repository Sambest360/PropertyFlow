/**
 * Portal syndication Mode A types (Oscar gap §3 / Jim #8 soft stamp).
 * Own-site marketplace + manual export pack + lead CSV — not live P24/PP push.
 */

export type PortalCode =
  | 'propertyflow_marketplace'
  | 'property24'
  | 'private_property'
  | 'other'

export type ListingPublicationStatus =
  | 'draft'
  | 'ready'
  | 'exported_manual'
  | 'live_manual'
  | 'error'
  | 'unpublished'

export type CanonicalListing = {
  listingId: string
  propertyId: string
  unitId?: string | null
  agencyId: string
  portalCode: PortalCode
  headline: string
  description: string
  listingMode: 'sale' | 'rent' | 'both'
  priceZar: number | null
  rentPcmZar: number | null
  beds: number
  baths: number
  parking: number
  floorSizeSqm: number | null
  suburb: string
  city: string
  province: string
  address: string
  lat: number | null
  lng: number | null
  images: string[]
  amenities: string[]
  /** Soft Mode A — staff flag only; no full mandate engine. */
  mandateActive: boolean
  availableOn?: string | null
  features: string[]
}

export type ListingPublication = {
  id: string
  propertyId: string
  unitId?: string | null
  portalCode: PortalCode
  status: ListingPublicationStatus
  externalListingId?: string | null
  liveUrl?: string | null
  lastError?: string | null
  lastPayloadHash?: string | null
  exportedAt?: string | null
  liveManualAt?: string | null
  unpublishedAt?: string | null
}

export type CompletenessIssue = {
  code: string
  severity: 'error' | 'warn'
  message: string
}

export type CompletenessResult = {
  ready: boolean
  score: number
  maxScore: number
  issues: CompletenessIssue[]
  /** Soft-warn only when mandate not active — does not hard-block Mode A pack. */
  mandateSoftWarn: string | null
}

export type PortalLead = {
  externalId: string
  portalCode: PortalCode
  propertyId?: string | null
  listingReference?: string | null
  name: string
  email: string
  phone: string
  message?: string
  type?: 'Buy' | 'Rent'
  receivedAt?: string
}

export type ListingPortalUpsertResult = {
  ok: boolean
  mode: 'manual_export' | 'partner'
  externalId?: string | null
  liveUrl?: string | null
  status: ListingPublicationStatus
  exportPack?: ExportPack
  error?: string
}

export type ExportPack = {
  portalCode: PortalCode
  format: 'json_csv'
  filenameBase: string
  json: string
  csv: string
  generatedAt: string
  honestyLabel: string
}

/**
 * Partner / manual portal adapter.
 * Live partner HTTP must refuse-closed until official docs + keys exist.
 */
export interface IListingPortalAdapter {
  readonly id: string
  readonly portalCode: PortalCode
  /** True only when a live partner adapter is intended (still refuse without keys). */
  readonly live: boolean
  readonly configured: boolean
  upsertListing(canonical: CanonicalListing): Promise<ListingPortalUpsertResult>
  unpublish(externalId: string): Promise<{ ok: boolean; error?: string }>
  pullLeads?(since: string): Promise<PortalLead[]>
}

export class NotConfiguredError extends Error {
  readonly code = 'NotConfiguredError'
  constructor(message: string) {
    super(message)
    this.name = 'NotConfiguredError'
  }
}
