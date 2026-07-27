/**
 * Document / media URL helpers for demo + future object storage.
 *
 * In the Vite mock store, documents often only have metadata. These helpers
 * normalise display names and produce safe preview / download hrefs.
 */

const DEMO_DOC_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_DOCS_BASE_URL) ||
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources'

/** Stable public sample PDFs for demo document rows (not tenant PII). */
export const DEMO_SAMPLE_FILES = {
  lease: `${DEMO_DOC_BASE}/pdf.pdf`,
  id: `${DEMO_DOC_BASE}/pdf.pdf`,
  invoice: `${DEMO_DOC_BASE}/pdf.pdf`,
  brochure: `${DEMO_DOC_BASE}/pdf.pdf`,
  coc: `${DEMO_DOC_BASE}/pdf.pdf`,
} as const

export type DocumentLike = {
  name: string
  fileUrl?: string | null
  category?: string
  mimeType?: string | null
}

/** Prefer explicit URL; otherwise map category → demo sample. */
export function resolveDocumentUrl(doc: DocumentLike): string | null {
  if (doc.fileUrl && doc.fileUrl.trim()) return doc.fileUrl.trim()
  const cat = (doc.category ?? '').toLowerCase()
  if (cat.includes('lease')) return DEMO_SAMPLE_FILES.lease
  if (cat.includes('title') || cat === 'id') return DEMO_SAMPLE_FILES.id
  if (cat.includes('invoice') || cat.includes('other')) return DEMO_SAMPLE_FILES.invoice
  if (cat.includes('marketing')) return DEMO_SAMPLE_FILES.brochure
  if (cat.includes('compliance') || cat.includes('inspection')) return DEMO_SAMPLE_FILES.coc
  return null
}

export function documentDisplayName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').trim() || name
}

export function isProbablyImageUrl(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url) || url.includes('images.unsplash.com')
}

/** Build a Google Static Maps image URL (graceful null when no key). */
export function staticMapImageUrl(opts: {
  lat: number
  lng: number
  zoom?: number
  width?: number
  height?: number
  apiKey?: string
}): string | null {
  const key =
    opts.apiKey ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY) ||
    ''
  if (!key) return null
  const w = opts.width ?? 640
  const h = opts.height ?? 360
  const z = opts.zoom ?? 14
  const url = new URL('https://maps.googleapis.com/maps/api/staticmap')
  url.searchParams.set('center', `${opts.lat},${opts.lng}`)
  url.searchParams.set('zoom', String(z))
  url.searchParams.set('size', `${w}x${h}`)
  url.searchParams.set('scale', '2')
  url.searchParams.set('maptype', 'roadmap')
  url.searchParams.set('markers', `color:0x1B4F72|${opts.lat},${opts.lng}`)
  url.searchParams.set('key', key)
  return url.toString()
}
