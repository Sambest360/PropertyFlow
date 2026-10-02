/**
 * Listing portal adapters (Mode A).
 * - ManualExportAdapter: builds export pack; marks exported_manual — no HTTP.
 * - RefuseClosedPartnerAdapter: hard-refuses live P24/PP push (no invented keys/paths).
 */

import { buildManualExportPack, hashCanonicalPayload } from './exportPack'
import type {
  CanonicalListing,
  IListingPortalAdapter,
  ListingPortalUpsertResult,
  PortalCode,
  PortalLead,
} from './types'
import { NotConfiguredError } from './types'

/** Manual pack workflow — zero portal credentials required. */
export class ManualExportAdapter implements IListingPortalAdapter {
  readonly id = 'manual_export'
  readonly live = false
  readonly configured = true
  readonly portalCode: PortalCode

  constructor(portalCode: PortalCode = 'property24') {
    this.portalCode = portalCode
  }

  async upsertListing(canonical: CanonicalListing): Promise<ListingPortalUpsertResult> {
    const listing = { ...canonical, portalCode: this.portalCode }
    const pack = buildManualExportPack(listing)
    return {
      ok: true,
      mode: 'manual_export',
      externalId: null,
      liveUrl: null,
      status: 'exported_manual',
      exportPack: pack,
    }
  }

  async unpublish(_externalId: string): Promise<{ ok: boolean; error?: string }> {
    return {
      ok: true,
    }
  }
}

/**
 * Placeholder for approved partner / direct P24 or PP feed.
 * Always refuse-closed — do not invent partner REST paths or keys.
 */
export class RefuseClosedPartnerAdapter implements IListingPortalAdapter {
  readonly id: string
  readonly live = true
  readonly configured: boolean
  readonly portalCode: PortalCode
  private readonly reason: string

  constructor(
    portalCode: Extract<PortalCode, 'property24' | 'private_property'>,
    config: { configured?: boolean; vendorHint?: string } = {},
  ) {
    this.portalCode = portalCode
    this.id = `partner_${portalCode}`
    this.configured = Boolean(config.configured)
    const vendor = config.vendorHint ?? 'approved vendor (Prop Data / PropCon class)'
    this.reason = this.configured
      ? `${portalCode} live API adapter is a placeholder. Partner credentials may be present but HTTP client is not implemented — use ManualExportAdapter / export pack. Official portal docs required (escalate to Michael). Vendor hint: ${vendor}.`
      : `${portalCode} partner adapter is not configured. Mode A refuses live push — use manual export pack. Do not invent portal keys or scrape.`
  }

  async upsertListing(_canonical: CanonicalListing): Promise<ListingPortalUpsertResult> {
    return {
      ok: false,
      mode: 'partner',
      status: 'error',
      error: this.reason,
    }
  }

  async unpublish(_externalId: string): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: this.reason }
  }

  async pullLeads(_since: string): Promise<PortalLead[]> {
    throw new NotConfiguredError(this.reason)
  }
}

export type SyndicationAdapterKind = 'manual' | 'partner_refuse'

/** Resolve Mode A adapter — default manual; partner always refuse-closed. */
export function listingPortalAdapterFromEnv(
  portalCode: Extract<PortalCode, 'property24' | 'private_property'>,
  env: Record<string, string | undefined> = {},
): IListingPortalAdapter {
  const kind = (
    env.SYNDICATION_ADAPTER ??
    env.VITE_SYNDICATION_ADAPTER ??
    'manual'
  ).toLowerCase()
  if (kind === 'partner' || kind === 'partner_refuse') {
    const keyPresent = Boolean(
      (env.SYNDICATION_PARTNER_API_KEY ?? env.VITE_SYNDICATION_PARTNER_API_KEY ?? '').trim(),
    )
    return new RefuseClosedPartnerAdapter(portalCode, { configured: keyPresent })
  }
  return new ManualExportAdapter(portalCode)
}

export function payloadHashForCanonical(listing: CanonicalListing): string {
  return hashCanonicalPayload(listing)
}
