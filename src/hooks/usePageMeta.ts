import { useEffect } from 'react'

export type PageMetaInput = {
  title?: string
  description?: string
  /** Absolute or site-relative OG image URL */
  image?: string
  /** Canonical path, e.g. `/listing/abc` */
  path?: string
  /** Preload a hero/LCP image URL */
  preloadImage?: string
}

const SITE_NAME = 'Lekaya Rentals'
const DEFAULT_TITLE = `${SITE_NAME} — Property Management & Sales`
const DEFAULT_DESCRIPTION =
  'Browse, buy, and rent properties across South Africa. Search listings, book viewings, and apply online with Lekaya Rentals.'
const DEFAULT_OG_IMAGE = '/og-image.png?v=2'

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function upsertLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

function upsertPreloadImage(href: string) {
  const id = 'pf-lcp-preload'
  let el = document.getElementById(id) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.id = id
    el.rel = 'preload'
    el.as = 'image'
    document.head.appendChild(el)
  }
  el.href = href
}

function removePreloadImage() {
  document.getElementById('pf-lcp-preload')?.remove()
}

function absoluteUrl(path: string): string {
  if (path.startsWith('http')) return path
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

function applyDefaultMeta() {
  document.title = DEFAULT_TITLE
  upsertMeta('name', 'description', DEFAULT_DESCRIPTION)
  upsertMeta('property', 'og:title', DEFAULT_TITLE)
  upsertMeta('property', 'og:description', DEFAULT_DESCRIPTION)
  upsertMeta('property', 'og:site_name', SITE_NAME)
  upsertMeta('property', 'og:type', 'website')
  const defaultOg = absoluteUrl(DEFAULT_OG_IMAGE)
  upsertMeta('property', 'og:image', defaultOg)
  upsertMeta('name', 'twitter:card', 'summary_large_image')
  upsertMeta('name', 'twitter:title', DEFAULT_TITLE)
  upsertMeta('name', 'twitter:description', DEFAULT_DESCRIPTION)
  upsertMeta('name', 'twitter:image', defaultOg)
}

export function usePageMeta(input: PageMetaInput = {}) {
  const title = input.title ? `${input.title} | ${SITE_NAME}` : DEFAULT_TITLE
  const description = input.description ?? DEFAULT_DESCRIPTION
  const canonical = input.path ? absoluteUrl(input.path) : undefined
  const ogImage = absoluteUrl(input.image ?? DEFAULT_OG_IMAGE)

  useEffect(() => {
    document.title = title
    upsertMeta('name', 'description', description)
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:site_name', SITE_NAME)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('property', 'og:image', ogImage)
    upsertMeta('name', 'twitter:image', ogImage)

    if (canonical) {
      upsertLink('canonical', canonical)
      upsertMeta('property', 'og:url', canonical)
    }
    if (input.preloadImage) {
      upsertPreloadImage(absoluteUrl(input.preloadImage))
    } else {
      removePreloadImage()
    }

    return () => {
      applyDefaultMeta()
      removePreloadImage()
    }
  }, [title, description, canonical, ogImage, input.preloadImage])
}
