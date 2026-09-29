import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../..')
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
}

/**
 * SHA-256 of the PayFast merchant id, merchant key, and passphrase.
 * Lengths let the scan hash candidate substrings. The credential strings
 * themselves are not in this file.
 */
const CREDENTIAL_DIGESTS: ReadonlyArray<{ length: number; sha256: string }> = [
  { length: 8, sha256: 'b13339c0d3366ab8eb16f98bd9f903e5f5a6095d740654e818c95f1bcb3ab6cf' },
  { length: 13, sha256: 'e0f8bc43ad1fe2d7e9c26d76cd4a1d854c743eeb0ce05f12e100d17bf966a384' },
  { length: 32, sha256: '108addc3c083003b0bda2ac51b796f3bbae40523281e982aa6f110f9154cde14' },
]

const TEXT_FILE = /\.(?:ts|tsx|js|jsx|mjs|cjs|css|html|json|map|svg|txt|webmanifest)$/

const ASSIGNMENT =
  /(?:merchant_key|merchant_id|passphrase)\s*[:=]\s*(['"`])([^'"`]*)\1/gi

function headerMap(): Map<string, string> {
  const map = new Map<string, string>()
  for (const block of vercel.headers ?? []) {
    if (block.source !== '/(.*)') continue
    for (const header of block.headers) map.set(header.key, header.value)
  }
  return map
}

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path, out)
    else if (TEXT_FILE.test(name)) out.push(path)
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Reasons only — never the credential text. */
function scanText(text: string): string[] {
  const reasons: string[] = []
  for (const match of text.matchAll(ASSIGNMENT)) {
    const field = match[0].split(/[:=]/)[0]?.trim() || 'credential'
    reasons.push(`assignment to ${field}`)
  }
  const runs = text.match(/[A-Za-z0-9]+/g) ?? []
  for (const run of runs) {
    for (const credential of CREDENTIAL_DIGESTS) {
      if (run.length < credential.length) continue
      const last = run.length - credential.length
      for (let i = 0; i <= last; i++) {
        if (sha256(run.slice(i, i + credential.length)) === credential.sha256) {
          reasons.push('sha256 digest match')
          return reasons
        }
      }
    }
  }
  return reasons
}

describe('vercel security headers', () => {
  const headers = headerMap()

  it('sends a CSP that allows Supabase, Google Maps, Speed Insights, and PayFast forms', () => {
    const csp = headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain('https://*.supabase.co')
    expect(csp).toContain('wss://*.supabase.co')
    expect(csp).toContain('https://maps.googleapis.com')
    expect(csp).toContain('https://maps.gstatic.com')
    expect(csp).toContain('https://va.vercel-scripts.com')
    expect(csp).toContain('https://vitals.vercel-insights.com')
    expect(csp).toContain('form-action')
    expect(csp).toContain('https://www.payfast.co.za')
    expect(csp).toContain('https://sandbox.payfast.co.za')
  })

  it('sends HSTS, nosniff, and a Referrer-Policy', () => {
    const hsts = headers.get('Strict-Transport-Security') ?? ''
    expect(hsts).toMatch(/max-age=\d+/)
    expect(hsts).toContain('includeSubDomains')
    expect(hsts).not.toMatch(/preload/i)
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })
})

function collectHits(dir: string): string[] {
  const hits: string[] = []
  for (const file of walkCollect(dir)) {
    for (const reason of scanText(readFileSync(file, 'utf8'))) hits.push(`${file}: ${reason}`)
  }
  return hits
}

describe('frontend PayFast secrets', () => {
  it('scans src for credential assignments and known digests', () => {
    const srcDir = join(root, 'src')
    expect(existsSync(srcDir), 'src/ must exist').toBe(true)
    expect(collectHits(srcDir)).toEqual([])
  })

  it('scans dist for credential assignments and known digests', (ctx) => {
    if (!process.env.CI) {
      ctx.skip(
        'Skipping the dist/ scan because CI is not set. A leftover dist/ is not scanned. In CI this fails if dist/ is missing. Run npm run test:bundle-secrets to build and scan the bundle.',
      )
      return
    }
    const distDir = join(root, 'dist')
    expect(existsSync(distDir), 'dist/ must exist in CI — run npm run test:bundle-secrets').toBe(true)
    expect(collectHits(distDir)).toEqual([])
  })
})

function walkCollect(dir: string): string[] {
  const files: string[] = []
  walk(dir, files)
  return files
}
