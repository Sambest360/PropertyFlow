/**
 * open-checkout-real (Jim C5): no client file may carry the old sandbox
 * checkout bridge: the PayFast sandbox host, the Peach test host, the public
 * sandbox merchant id / key, or a made-up "demo_" signature string.
 *
 * Scans src/**\/*.{ts,tsx,css,html}, excluding ONLY test files
 * (*.test.*, *.spec.*, __tests__/). The self-test proves the walker sees
 * src/lib/api (where the old bridge lived) and a .css file, and that the
 * exclusions are exactly the test files.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')
const SCANNED_EXT = /\.(ts|tsx|css|html)$/
const isTestFile = (rel: string) =>
  /\.(test|spec)\.[^/]+$/.test(rel) || rel.split(sep).includes('__tests__')

function walkSrc(dir = SRC): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...walkSrc(full))
      continue
    }
    const rel = relative(SRC, full)
    if (!SCANNED_EXT.test(name)) continue
    if (isTestFile(rel)) continue
    out.push(rel)
  }
  return out
}

/** Hosts and sandbox credentials: matched case-insensitively. */
const FORBIDDEN_CI = ['sandbox.payfast.co.za', 'test.oppwa.com', 'wkq8dmfysau1q', '10047719']
/**
 * The bridge's fake signature was a string literal starting with "demo_"
 * (`demo_${hash}`). Matched as a quoted literal prefix, case-sensitive,
 * because upper-case DEMO_* constant NAMES (DEMO_SWITCHER, DEMO_SAMPLE_FILES)
 * are unrelated and legitimate.
 */
const FORBIDDEN_RE = [/['"`]demo_/]

function findForbidden(text: string): string[] {
  const hits: string[] = []
  const lower = text.toLowerCase()
  for (const s of FORBIDDEN_CI) if (lower.includes(s)) hits.push(s)
  for (const re of FORBIDDEN_RE) if (re.test(text)) hits.push(String(re))
  return hits
}

describe('C5 guard: no sandbox checkout bridge in client source', () => {
  it('self-test: the walker sees src/lib/api and css, and excludes only test files', () => {
    const files = walkSrc()
    expect(files).toContain(join('lib', 'api', 'applicationStatusApi.ts'))
    expect(files.some((f) => f.startsWith(join('lib', 'api') + sep))).toBe(true)
    expect(files.some((f) => f.endsWith('.css'))).toBe(true)
    expect(files.some((f) => f.endsWith('.tsx'))).toBe(true)
    expect(files.some((f) => /\.(test|spec)\./.test(f))).toBe(false)
    // This very file is a test file and must be excluded; its source neighbour is not.
    expect(files).not.toContain(join('lib', 'payfast', 'noSandboxHost.guard.test.ts'))
    expect(files).toContain(join('lib', 'payfast', 'checkout.ts'))
    expect(isTestFile(join('a', '__tests__', 'x.ts'))).toBe(true)
    expect(isTestFile(join('a', 'x.spec.tsx'))).toBe(true)
    expect(isTestFile(join('a', 'contest.ts'))).toBe(false)
  })

  it('self-test: the matcher catches each forbidden string (any case) and the demo_ literal', () => {
    expect(findForbidden("url: 'https://SANDBOX.PayFast.co.za/eng/process'")).toEqual(['sandbox.payfast.co.za'])
    expect(findForbidden('https://test.oppwa.com/v1/paymentWidgets.js')).toEqual(['test.oppwa.com'])
    expect(findForbidden("merchant_key: 'WKQ8DMFYSAU1Q'")).toEqual(['wkq8dmfysau1q'])
    expect(findForbidden("merchant_id: '10047719'")).toEqual(['10047719'])
    expect(findForbidden('return `demo_${hash.toString(16)}`')).toHaveLength(1)
    expect(findForbidden("signature: 'demo_abc'")).toHaveLength(1)
    expect(findForbidden('const DEMO_SWITCHER = 1; DEMO_SAMPLE_FILES.lease')).toEqual([])
  })

  it('no scanned src file contains a forbidden host, key or demo signature', () => {
    const offenders: string[] = []
    for (const rel of walkSrc()) {
      const hits = findForbidden(readFileSync(join(SRC, rel), 'utf8'))
      if (hits.length) offenders.push(`${rel}: ${hits.join(', ')}`)
    }
    expect(offenders).toEqual([])
  })
})
