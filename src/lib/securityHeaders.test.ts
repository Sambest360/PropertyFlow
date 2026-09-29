import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../..')
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
}

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
    if (name === 'node_modules' || name === 'dist') continue
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path, out)
    else if (/\.(ts|tsx|js|jsx|css|html)$/.test(name)) out.push(path)
  }
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
    expect(headers.get('Strict-Transport-Security')).toMatch(/max-age=\d+/)
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })
})

describe('frontend PayFast secrets', () => {
  it('does not keep the merchant id, key, or passphrase in src', () => {
    const files: string[] = []
    walk(join(root, 'src'), files)
    // Split so this test file does not itself contain the secret literals.
    const banned = ['wkq8' + 'dmfysau1q', '1004' + '7719', 'QjjCCNZ1VgtY' + 'axivmXOWLmAlunZpU0Xk']
    const hits: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const secret of banned) {
        if (text.includes(secret)) hits.push(`${file} contains ${secret}`)
      }
    }
    expect(hits).toEqual([])
  })
})
