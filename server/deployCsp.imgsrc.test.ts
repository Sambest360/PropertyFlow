import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

/**
 * P5: guest-house photo links come from images.pexels.com, so the CSP img-src
 * allows that one host (written like the unsplash entry). Nothing else in the
 * CSP changes. Reads deploy/nginx-security-headers.conf the way
 * server/deployNginx.t7.test.ts does (its comment-stripping helper is copied, not imported).
 */
const read = (p: string) => readFileSync(new URL(`../deploy/${p}`, import.meta.url), 'utf8')

/** Drop `#` comments (outside quotes). Copied from deployNginx.t7.test.ts. */
function stripComments(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      let q: string | null = null
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (q) {
          if (ch === q) q = null
        } else if (ch === '"' || ch === "'") q = ch
        else if (ch === '#') return line.slice(0, i)
      }
      return line
    })
    .join('\n')
}

const src = stripComments(read('nginx-security-headers.conf'))
const headers = [...src.matchAll(/add_header\s+Content-Security-Policy\s+"([^"]*)"\s+always;/g)]
const directives = () => headers[0][1].split(';').map((d) => d.trim()).filter(Boolean)
const imgSrc = () => directives().find((d) => d.startsWith('img-src '))!.split(/\s+/).slice(1)

/** img-src sources before P5. */
const IMG_SRC_BEFORE = ["'self'", "data:", "blob:", "https://*.googleapis.com", "https://*.gstatic.com", "https://*.google.com", "https://*.ggpht.com", "https://*.googleusercontent.com", "https://*.supabase.co", "https://tile.openstreetmap.org", "https://*.tile.openstreetmap.org", "https://images.unsplash.com", "https://*.oppwa.com"]
/**
 * Every other directive as it was before P5, as a sha256 of the directives
 * joined by newlines (a fingerprint, so this file doesn't spell out hosts that
 * server/payfastCheckoutHost.test.ts keeps out of server/ and src/).
 */
const OTHER_DIRECTIVES_SHA256 = '5db4312b9767d7225e5a58038b7d10d8c3d7e72af199901eb0ffdb38a425247f'

describe('CSP img-src allows guest-house photo links (P5)', () => {
  it('there is exactly one Content-Security-Policy add_header', () => {
    expect(headers).toHaveLength(1)
  })
  it('img-src contains images.pexels.com, written like the unsplash entry', () => {
    const unsplash = imgSrc().find((s) => s.includes('images.unsplash.com'))!
    expect(imgSrc()).toContain(unsplash.replace('images.unsplash.com', 'images.pexels.com'))
  })
  it('img-src still has every source it had', () => {
    expect(IMG_SRC_BEFORE.filter((s) => !imgSrc().includes(s))).toEqual([])
  })
  it('img-src has no wildcard, bare scheme or *.pexels.com', () => {
    expect(imgSrc().filter((s) => ['*', 'https:', 'http:'].includes(s) || /\*\.pexels\.com/.test(s))).toEqual([])
  })
  it('every other directive is unchanged', () => {
    const now = directives().filter((d) => !d.startsWith('img-src ')).join('\n')
    expect(createHash('sha256').update(now).digest('hex')).toBe(OTHER_DIRECTIVES_SHA256)
  })
})
