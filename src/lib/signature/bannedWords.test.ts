import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * CR10 spec §10: grep ALL of src/ and server/ for signature-claim wording.
 * Pattern is the spec's own (case-insensitive, word boundaries):
 *   advanced electronic | AES | ECTA-valid | legally binding |
 *   certified signature | qualified signature
 * Excluded: test files (*.test.ts / *.test.tsx) — they are not user-facing
 * strings and must name the banned words to check for them.
 * Unrelated uses of bare "certified" / "qualified" / "advanced" (e.g.
 * "Certified SA ID", a "Qualified" lead stage, "not RHA certified") are not
 * signature claims and do not match the spec pattern.
 */
const BANNED =
  /\badvanced[\s-]+electronic\b|\bAES\b|\bECTA[\s-]*valid\b|\blegally[\s-]+binding\b|\bcertified[\s-]+(e-)?signature|\bqualified[\s-]+(e-)?signature/i

const root = resolve(__dirname, '../../..')
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs|html|json|md)$/
const isTest = (f: string) => /\.test\.(ts|tsx|js|jsx)$/.test(f)

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (EXT.test(name) && !isTest(name)) out.push(p)
  }
  return out
}

export function bannedHits(): string[] {
  const hits: string[] = []
  for (const top of ['src', 'server']) {
    for (const file of walk(resolve(root, top), [])) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (BANNED.test(line)) hits.push(`${relative(root, file)}:${i + 1}: ${line.trim()}`)
        })
    }
  }
  return hits
}

describe('CR10 banned signature wording (spec §10, all of src/ and server/)', () => {
  it('scans a real tree', () => {
    expect(walk(resolve(root, 'src'), []).length).toBeGreaterThan(50)
    expect(walk(resolve(root, 'server'), []).length).toBeGreaterThan(5)
  })
  it('the pattern catches each banned phrase', () => {
    for (const s of ['Advanced Electronic Signature', 'an aes signature', 'ECTA-valid', 'Legally binding', 'certified signature', 'qualified e-signature'])
      expect(BANNED.test(s), s).toBe(true)
    for (const s of ['Certified SA ID', 'Qualified', 'not RHA certified', 'ADVANCED', 'caesar'])
      expect(BANNED.test(s), s).toBe(false)
  })
  it('no file has banned signature wording', () => {
    expect(bannedHits()).toEqual([])
  })
})
