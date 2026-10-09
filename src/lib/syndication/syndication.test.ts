import { describe, expect, it } from 'vitest'
import type { PropertyAsset } from '../../types/domain'
import {
  ManualExportAdapter,
  RefuseClosedPartnerAdapter,
  SYNDICATION_MODE_A_COPY,
  assessPropertySyndicationReadiness,
  attemptLivePartnerPush,
  buildCanonicalListing,
  exportManualPackForPortal,
  filterNewPortalLeads,
  listingPortalAdapterFromEnv,
  markPublicationLiveManual,
  parsePortalLeadCsv,
  portalLeadCsvTemplateSample,
  portalLeadToLeadDraft,
  LEAD_CSV_HONESTY,
  EXPORT_PACK_HONESTY,
  NotConfiguredError,
} from './index'

function baseProperty(over: Partial<PropertyAsset> = {}): PropertyAsset {
  return {
    id: 'PR-SYN-001',
    agencyId: 'ag-1',
    landlordId: 'll-1',
    agentId: 'ag-user-1',
    title: 'Sunny 2-bed in Rosebank',
    type: 'Apartment',
    status: 'Published',
    listingMode: 'rent',
    price: null,
    rent: 12500,
    beds: 2,
    baths: 1,
    parking: 1,
    area: 78,
    city: 'Johannesburg',
    suburb: 'Rosebank',
    address: '12 Oxford Rd',
    lat: -26.146,
    lng: 28.041,
    images: [
      'https://example.com/1.jpg',
      'https://example.com/2.jpg',
      'https://example.com/3.jpg',
      'https://example.com/4.jpg',
      'https://example.com/5.jpg',
      'https://example.com/6.jpg',
      'https://example.com/7.jpg',
      'https://example.com/8.jpg',
    ],
    rooms: [],
    amenities: ['Fibre'],
    description:
      'Bright apartment with balcony near Gautrain. Open-plan living and secure parking.',
    featured: false,
    createdAt: '2026-09-01',
    mandateActive: true,
    ...over,
  }
}

describe('syndication Mode A honesty', () => {
  it('denies live P24 / portal parity claims', () => {
    expect(SYNDICATION_MODE_A_COPY).toMatch(/Non-production syndication/i)
    expect(SYNDICATION_MODE_A_COPY).toMatch(/not live P24/i)
    expect(SYNDICATION_MODE_A_COPY).toMatch(/manual/i)
    expect(SYNDICATION_MODE_A_COPY.toLowerCase()).not.toMatch(/live partner feed http/)
    expect(EXPORT_PACK_HONESTY.toLowerCase()).toMatch(/not live property24/)
    expect(LEAD_CSV_HONESTY.toLowerCase()).toMatch(/not live property24/)
  })
})

describe('canonical listing + completeness soft-gate', () => {
  it('scores a ready listing and uses canonical listing id', () => {
    const p = baseProperty()
    const listing = buildCanonicalListing(p, 'property24')
    expect(listing.listingId).toBe('PR-SYN-001')
    const ready = assessPropertySyndicationReadiness(p)
    expect(ready.ready).toBe(true)
    expect(ready.mandateSoftWarn).toBeNull()
    expect(ready.score).toBeGreaterThanOrEqual(8)
  })

  it('soft-warns when mandate incomplete without hard-blocking readiness errors', () => {
    const p = baseProperty({ mandateActive: false })
    const ready = assessPropertySyndicationReadiness(p)
    expect(ready.mandateSoftWarn).toMatch(/soft warning only/i)
    expect(ready.issues.some((i) => i.code === 'mandate' && i.severity === 'warn')).toBe(true)
    // title/images etc still ok → ready true (mandate is warn only)
    expect(ready.ready).toBe(true)
  })

  it('hard-errors when title or images missing', () => {
    const p = baseProperty({ title: '', images: [] })
    const ready = assessPropertySyndicationReadiness(p)
    expect(ready.ready).toBe(false)
    expect(ready.issues.some((i) => i.code === 'headline' && i.severity === 'error')).toBe(true)
    expect(ready.issues.some((i) => i.code === 'images_min' && i.severity === 'error')).toBe(true)
  })
})

describe('IListingPortalAdapter refuse-closed + manual pack', () => {
  it('ManualExportAdapter returns exported_manual pack without HTTP', async () => {
    const adapter = new ManualExportAdapter('property24')
    expect(adapter.live).toBe(false)
    const result = await adapter.upsertListing(buildCanonicalListing(baseProperty(), 'property24'))
    expect(result.ok).toBe(true)
    expect(result.mode).toBe('manual_export')
    expect(result.status).toBe('exported_manual')
    expect(result.exportPack?.csv).toContain('listing_id')
    expect(result.exportPack?.honestyLabel).toMatch(/not live/i)
  })

  it('RefuseClosedPartnerAdapter hard-refuses live push even if “configured”', async () => {
    const adapter = new RefuseClosedPartnerAdapter('private_property', { configured: true })
    expect(adapter.live).toBe(true)
    const result = await adapter.upsertListing(
      buildCanonicalListing(baseProperty(), 'private_property'),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/placeholder|not implemented|refuse/i)
    await expect(adapter.pullLeads!('2026-01-01')).rejects.toBeInstanceOf(NotConfiguredError)
  })

  it('listingPortalAdapterFromEnv partner kind is refuse-closed', async () => {
    const adapter = listingPortalAdapterFromEnv('property24', {
      SYNDICATION_ADAPTER: 'partner',
      SYNDICATION_PARTNER_API_KEY: 'fake-not-real',
    })
    expect(adapter.id).toMatch(/partner/)
    const result = await adapter.upsertListing(buildCanonicalListing(baseProperty(), 'property24'))
    expect(result.ok).toBe(false)
  })

  it('attemptLivePartnerPush never succeeds in Mode A', async () => {
    const out = await attemptLivePartnerPush(baseProperty(), 'property24')
    expect(out.ok).toBe(false)
    expect(out.error.length).toBeGreaterThan(10)
  })
})

describe('manual export pack + live_manual mark', () => {
  it('exportManualPackForPortal stamps exported_manual and keeps mandate soft-warn', async () => {
    const p = baseProperty({ mandateActive: null })
    const out = await exportManualPackForPortal(p, 'property24', { at: '2026-10-02T08:00:00.000Z' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.publication.status).toBe('exported_manual')
    expect(out.mandateSoftWarn).toMatch(/soft warning/i)
    expect(out.property.syndicationPublications?.[0]?.portalCode).toBe('property24')

    const live = markPublicationLiveManual(out.property, 'property24', {
      liveUrl: 'https://example.com/manual',
      at: '2026-10-02T09:00:00.000Z',
    })
    expect(live.ok).toBe(true)
    if (!live.ok) return
    expect(live.publication.status).toBe('live_manual')
    expect(live.publication.liveUrl).toBe('https://example.com/manual')
  })
})

describe('lead CSV → CRM source + external_id dedupe', () => {
  it('parses template and maps source + externalId', () => {
    const parsed = parsePortalLeadCsv(portalLeadCsvTemplateSample())
    expect(parsed.errors).toEqual([])
    expect(parsed.rows).toHaveLength(2)
    const draft = portalLeadToLeadDraft(parsed.rows[0]!, {
      agencyId: 'ag-1',
      propertyId: 'PR-DEMO-001',
      agentId: 'u1',
    })
    expect(draft.source).toBe('property24')
    expect(draft.externalId).toBe('P24-1001')
    expect(draft.channel).toBe('Property24')
  })

  it('dedupes by external_id and by email+listing within 7 days', () => {
    const parsed = parsePortalLeadCsv(portalLeadCsvTemplateSample())
    const { fresh, duplicates } = filterNewPortalLeads(parsed.rows, [
      {
        email: 'other@example.com',
        phone: '',
        propertyId: 'PR-DEMO-001',
        createdAt: '2026-10-01',
        externalId: 'P24-1001',
      },
    ])
    expect(duplicates.map((d) => d.externalId)).toContain('P24-1001')
    expect(fresh.map((f) => f.externalId)).toEqual(['PP-2002'])

    const contactDup = filterNewPortalLeads(parsed.rows, [
      {
        email: 'sara@example.com',
        phone: '+27830002222',
        propertyId: 'PR-DEMO-001',
        createdAt: new Date().toISOString().slice(0, 10),
        externalId: null,
      },
    ])
    expect(contactDup.duplicates.some((d) => d.externalId === 'PP-2002')).toBe(true)
  })
})
