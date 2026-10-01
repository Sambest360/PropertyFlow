/**
 * Document / media URL helpers for demo + future object storage.
 *
 * In the Vite mock store, documents often only have metadata. These helpers
 * normalise display names and produce safe preview / download hrefs.
 * Prefer real `fileUrl` / storage URLs — never invent a storage backend.
 */

import type { PropertyDocument, Role } from '../../types/domain'

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

export const PROPERTY_DOCUMENT_CATEGORIES = [
  'Title',
  'Compliance',
  'Lease',
  'Inspection',
  'Marketing',
  'Other',
] as const satisfies ReadonlyArray<PropertyDocument['category']>

export type PropertyDocCategory = (typeof PROPERTY_DOCUMENT_CATEGORIES)[number]

/** Landlord portfolio register: ownership, certificates, and leases. */
export const LANDLORD_VISIBLE_DOC_CATEGORIES: ReadonlySet<PropertyDocCategory> = new Set([
  'Title',
  'Compliance',
  'Lease',
])

/** Tenant tenancy register: lease PDF + compliance for their unit. */
export const TENANT_VISIBLE_DOC_CATEGORIES: ReadonlySet<PropertyDocCategory> = new Set([
  'Lease',
  'Compliance',
])

export type DocumentLike = {
  name: string
  fileUrl?: string | null
  category?: string
  mimeType?: string | null
  status?: string | null
}

/** Categories the role may see on the property document register. */
export function visibleDocumentCategoriesForRole(
  role: Role | string,
): ReadonlySet<PropertyDocCategory> | 'all' {
  if (role === 'landlord') return LANDLORD_VISIBLE_DOC_CATEGORIES
  if (role === 'tenant') return TENANT_VISIBLE_DOC_CATEGORIES
  return 'all'
}

export function documentCategoryVisibleToRole(
  category: PropertyDocument['category'] | string,
  role: Role | string,
): boolean {
  const allowed = visibleDocumentCategoriesForRole(role)
  if (allowed === 'all') return true
  return allowed.has(category as PropertyDocCategory)
}

export function filterDocumentsForRole<T extends { category: PropertyDocument['category'] }>(
  documents: readonly T[],
  role: Role | string,
): T[] {
  const allowed = visibleDocumentCategoriesForRole(role)
  if (allowed === 'all') return [...documents]
  return documents.filter((d) => allowed.has(d.category))
}

export function categoryFilterOptionsForRole(
  role: Role | string,
): Array<PropertyDocCategory | 'all'> {
  const allowed = visibleDocumentCategoriesForRole(role)
  if (allowed === 'all') return ['all', ...PROPERTY_DOCUMENT_CATEGORIES]
  return ['all', ...PROPERTY_DOCUMENT_CATEGORIES.filter((c) => allowed.has(c))]
}

/** Reject javascript:/data:text and other unsafe schemes; allow http(s), relative, blob, pdf/image data. */
export function isSafeDocumentHref(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true
  if (trimmed.startsWith('blob:')) return true
  if (/^data:application\/pdf/i.test(trimmed)) return true
  if (/^data:image\//i.test(trimmed)) return true
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function demoFallbackForCategory(category: string): string | null {
  const cat = category.toLowerCase()
  if (cat.includes('lease')) return DEMO_SAMPLE_FILES.lease
  if (cat.includes('title') || cat === 'id') return DEMO_SAMPLE_FILES.id
  if (cat.includes('invoice') || cat.includes('other')) return DEMO_SAMPLE_FILES.invoice
  if (cat.includes('marketing')) return DEMO_SAMPLE_FILES.brochure
  if (cat.includes('compliance') || cat.includes('inspection')) return DEMO_SAMPLE_FILES.coc
  return null
}

/**
 * Prefer explicit storage / file URL when safe.
 * Demo category stubs only for rows that look uploaded (not required/rejected).
 * Does not invent object-storage backends or signed-URL APIs.
 */
export function resolveDocumentUrl(doc: DocumentLike): string | null {
  const raw = doc.fileUrl?.trim()
  if (raw) {
    return isSafeDocumentHref(raw) ? raw : null
  }

  const status = (doc.status ?? '').toLowerCase()
  if (
    status === 'required' ||
    status === 'rejected' ||
    status === 'missing' ||
    status === 'pending'
  ) {
    return null
  }

  // Seed / demo rows without fileUrl still need a preview in local mock / test mode.
  const demoAllowed =
    typeof import.meta === 'undefined' ||
    import.meta.env?.DEV === true ||
    Boolean(import.meta.env?.VITE_DEMO_DOCS_BASE_URL)

  if (!demoAllowed) return null
  return demoFallbackForCategory(doc.category ?? '')
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
