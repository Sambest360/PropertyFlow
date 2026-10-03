import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { propertiesFromInfrastructure } from '../src/data/infraSeed.js'
import { AGENCY_TO_CLIENT } from './idMap.js'

/**
 * Vercel Node ESM function (api/index.ts) traces listingResolve → infraSeed.js,
 * then fails: Cannot find module '/var/task/src/data/platformLookups' imported
 * from /var/task/src/data/infraSeed.js. includeFiles does not ship src/data, and
 * infraSeed's import of ./platformLookups has no .js extension.
 */
describe('listing resolver does not pull the missing Vercel module', () => {
  it('server listing resolver graph has no infraSeed or platformLookups import', () => {
    const root = process.cwd()
    const importFrom = /from\s+['"]([^'"]+)['"]/g
    const dynImport = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    const seen = new Set<string>()
    const queue = [resolve(root, 'server/listingResolve.ts')]
    const specs: string[] = []

    while (queue.length) {
      const cur = queue.pop()!
      if (seen.has(cur)) continue
      seen.add(cur)
      const text = readFileSync(cur, 'utf8')
      const found = [...text.matchAll(importFrom), ...text.matchAll(dynImport)].map((m) => m[1] ?? '')
      for (const spec of found) {
        specs.push(`${cur.slice(root.length + 1)} → ${spec}`)
        if (!spec.startsWith('.')) continue
        const base = resolve(dirname(cur), spec.replace(/\.js$/, ''))
        for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
          try {
            readFileSync(cand)
            queue.push(cand)
            break
          } catch {
            /* not this candidate */
          }
        }
      }
    }

    const pulled = specs.filter((line) => /infraSeed|platformLookups/.test(line))
    expect(pulled, pulled.join('\n')).toEqual([])
    const files = [...seen].map((file) => file.slice(root.length + 1))
    expect(files.some((file) => file.includes('infraSeed') || file.includes('platformLookups'))).toBe(false)
  })

  it('inlined public listing still matches the page Humewood row and Horizon client', () => {
    const page = propertiesFromInfrastructure().find(
      (p) => p.id === 'PR-1011' && p.unitId === 'unt-skyline-b14',
    )
    expect(page?.title).toBe('Humewood Beach Apartment B14')
    expect(page?.agencyId).toBe('ag-horizon')
    expect(AGENCY_TO_CLIENT['ag-horizon']).toBe('a1000001-0001-4000-8000-000000000001')
    const src = readFileSync(resolve(process.cwd(), 'server/listingResolve.ts'), 'utf8')
    expect(src).toContain("title: 'Humewood Beach Apartment B14'")
    expect(src).toContain("agencyId: 'ag-horizon'")
    expect(src).not.toMatch(/from\s+['"][^'"]*infraSeed/)
    expect(src).not.toMatch(/from\s+['"][^'"]*platformLookups/)
  })
})
