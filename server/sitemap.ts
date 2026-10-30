/**
 * sitemap.xml for search engines: the public marketplace pages plus every
 * published listing (the same rows signed-out visitors see). Served at
 * /api/sitemap.xml and named in public/robots.txt.
 */

/** Public pages worth indexing (no workspace, account or auth pages). */
export const SITEMAP_STATIC_PATHS = [
  '/',
  '/browse',
  '/browse?mode=rent',
  '/browse?mode=buy',
  '/browse?mode=commercial',
  '/calculators',
  '/privacy',
  '/terms',
] as const

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Published listings from a guest marketplace payload: id and a YYYY-MM-DD date when known. */
export function sitemapListings(payload: Record<string, unknown>): Array<{ id: string; lastmod?: string }> {
  const rows = Array.isArray(payload.properties) ? (payload.properties as Array<Record<string, unknown>>) : []
  const seen = new Set<string>()
  const out: Array<{ id: string; lastmod?: string }> = []
  for (const p of rows) {
    const id = typeof p.id === 'string' ? p.id.trim() : ''
    if (!id || seen.has(id) || String(p.status ?? '') !== 'Published') continue
    seen.add(id)
    const date = [p.updatedAt, p.createdAt].find((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) as string | undefined
    out.push({ id, lastmod: date?.slice(0, 10) })
  }
  return out
}

export function buildSitemapXml(origin: string, listings: Array<{ id: string; lastmod?: string }>): string {
  const base = origin.replace(/\/+$/, '')
  const url = (loc: string, lastmod?: string) =>
    `  <url><loc>${xmlEscape(base + loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...SITEMAP_STATIC_PATHS.map((p) => url(p)),
    ...listings.map((l) => url(`/listing/${encodeURIComponent(l.id)}`, l.lastmod)),
    '</urlset>',
    '',
  ].join('\n')
}
