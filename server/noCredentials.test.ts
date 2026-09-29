import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PAYFAST_DOCS_VECTOR_DIGESTS,
  credentialScanRoots,
  retiredDigestsFromEnv,
  scanCredentialPatterns,
  scanRetiredDigests,
  sha256,
} from '../scripts/no-credentials.mjs'

describe('no credentials in code', () => {
  it('src and server only use fake merchant_key and passphrase literals', () => {
    expect(scanCredentialPatterns(['src', 'server'])).toEqual([])
  })

  it('dist only uses fake merchant_key and passphrase literals', () => {
    if (!existsSync('dist')) return
    expect(scanCredentialPatterns(['dist'])).toEqual([])
  })

  it('PayFast docs merchant key and passphrase digests are absent from the tree', () => {
    expect(scanRetiredDigests(['.'], PAYFAST_DOCS_VECTOR_DIGESTS)).toEqual([])
  })

  const digests = retiredDigestsFromEnv()
  it.skipIf(digests.length === 0)(
    'SHA-256 digests of retired PayFast values from env are absent from src, server, and dist',
    () => {
      const roots = credentialScanRoots().filter((root) => root !== 'dist' || existsSync('dist'))
      expect(scanRetiredDigests(roots, digests)).toEqual([])
    },
  )

  it('hashes an env-supplied value and finds a literal, base64, reversal, or joined pieces', () => {
    expect(retiredDigestsFromEnv({})).toEqual([])
    const secret = 'clearly-fake-retired-value'
    const digests = retiredDigestsFromEnv({ PAYFAST_RETIRED_MERCHANT_KEY: secret })
    expect(digests[0]?.digest).toBe(sha256(secret))
    const dir = mkdtempSync(join(tmpdir(), 'pf-cred-'))
    const file = join(dir, 'sample.ts')
    const assign = (value: string) => {
      writeFileSync(file, `export const merchantKey = ${JSON.stringify(value)}\n`)
    }
    try {
      assign(secret)
      expect(scanRetiredDigests([dir], digests).length).toBeGreaterThan(0)

      assign(Buffer.from(secret).toString('base64'))
      expect(scanRetiredDigests([dir], digests).length).toBeGreaterThan(0)

      assign(secret.split('').reverse().join(''))
      expect(scanRetiredDigests([dir], digests).length).toBeGreaterThan(0)

      const mid = Math.floor(secret.length / 2)
      writeFileSync(
        file,
        `export const merchantKey = ${JSON.stringify(secret.slice(0, mid))} + ${JSON.stringify(secret.slice(mid))}\n`,
      )
      expect(scanRetiredDigests([dir], digests).length).toBeGreaterThan(0)

      assign('not-a-real-key')
      expect(scanCredentialPatterns([dir])).toEqual([])
      assign('supersecretvalue')
      expect(scanCredentialPatterns([dir])).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
