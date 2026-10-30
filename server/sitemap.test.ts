import { describe, expect, it } from 'vitest'
import { buildSitemapXml, sitemapListings } from './sitemap'

describe('sitemap', () => {
  it('lists public pages and only published listings, once each', () => {
    const listings = sitemapListings({
      properties: [
        { id: 'ysmjei', status: 'Published', createdAt: '2026-10-26' },
        { id: 'ysmjei', status: 'Published' },
        { id: 'draft1', status: 'Draft' },
        { id: 'rk&k', status: 'Published', updatedAt: '2026-10-28T10:00:00Z' },
        { status: 'Published' },
      ],
    })
    expect(listings).toEqual([
      { id: 'ysmjei', lastmod: '2026-10-26' },
      { id: 'rk&k', lastmod: '2026-10-28' },
    ])
    const xml = buildSitemapXml('https://www.lekayarentals.site/', listings)
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset /)
    expect(xml).toContain('<loc>https://www.lekayarentals.site/</loc>')
    expect(xml).toContain('<loc>https://www.lekayarentals.site/browse?mode=rent</loc>')
    expect(xml).toContain('<loc>https://www.lekayarentals.site/listing/ysmjei</loc><lastmod>2026-10-26</lastmod>')
    expect(xml).toContain('/listing/rk%26k</loc>')
    expect(xml).not.toContain('draft1')
    expect(xml).not.toContain('/workspace')
  })

  it('handles a payload without listings', () => {
    expect(sitemapListings({})).toEqual([])
    expect(buildSitemapXml('https://x.test', [])).toContain('<loc>https://x.test/terms</loc>')
  })
})
