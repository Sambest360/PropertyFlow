/**
 * Build step (vite.config.ts): writes dist/<page>/index.html for every public
 * page in src/lib/seoPages.ts with its own <title>, description, canonical URL,
 * keywords and a readable heading + intro inside #root. Search engines and
 * link previews that do not run JavaScript still see the right page; the app
 * replaces the #root content when it starts. Query-string pages (/browse?mode=…)
 * share index.html and are skipped.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { allSeoLandingPages, staticSeoPages, type SeoPageMeta } from '../src/lib/seoPages.ts'

const SITE = 'https://lekayarentals.site'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function setMeta(html: string, attr: 'name' | 'property', key: string, value: string): string {
  const re = new RegExp(`<meta\\s+${attr}="${key}"[^>]*?/?>`, 's')
  const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`)
}

export function pageHtml(template: string, page: SeoPageMeta): string {
  const title = `${page.title} | Lekaya Rentals`
  const url = `${SITE}${page.path}`
  let html = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
  html = setMeta(html, 'name', 'description', page.description)
  html = setMeta(html, 'property', 'og:title', title)
  html = setMeta(html, 'property', 'og:description', page.description)
  html = setMeta(html, 'property', 'og:url', url)
  html = setMeta(html, 'name', 'twitter:title', title)
  html = setMeta(html, 'name', 'twitter:description', page.description)
  if (page.keywords.length) html = setMeta(html, 'name', 'keywords', `${page.keywords.join(', ')}, Lekaya Rentals`)
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`)
  const body = `<main style="max-width:48rem;margin:0 auto;padding:2rem 1rem;font-family:sans-serif"><h1>${esc(page.h1)}</h1><p>${esc(page.intro)}</p><p><a href="/browse">Browse property on Lekaya Rentals</a></p></main>`
  // Replace the "Loading…" placeholder inside #root with the page's heading and intro.
  return html.replace(/<div id="root">[\s\S]*?Loading Lekaya Rentals…\s*<\/div>/, `<div id="root">${body}`)
}

export function writeSeoPages(distDir: string): number {
  const template = readFileSync(join(distDir, 'index.html'), 'utf8')
  let n = 0
  for (const page of [...staticSeoPages(), ...allSeoLandingPages()]) {
    if (page.path === '/' || page.path.includes('?')) continue
    const dir = join(distDir, page.path)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), pageHtml(template, page))
    n++
  }
  return n
}
