import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Vercel Node ESM ("type":"module") resolves only explicit extensions.
 * includeFiles copies src/lib/** into /var/task, but extensionless imports still
 * fail at runtime (seen: contractors.js → ./verification → api_boot_failed 503).
 */
describe('vercel.json API includeFiles', () => {
  it('bundles server plus src/lib and src/types (register-supabase deps)', () => {
    const raw = readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')
    const cfg = JSON.parse(raw) as {
      functions?: Record<string, { includeFiles?: string }>
    }
    const include = cfg.functions?.['api/index.ts']?.includeFiles ?? ''
    expect(include).toMatch(/server\/\*\*/)
    expect(include).toMatch(/src\/lib\/\*\*/)
    expect(include).toMatch(/src\/types\/\*\*/)
  })

  it('contractors imports verification with .js (Node ESM on Vercel)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/contractors.ts'), 'utf8')
    expect(src).toMatch(/from ['"]\.\/verification\.js['"]/)
    expect(src).not.toMatch(/from ['"]\.\/verification['"]/)
  })

  it('server→src/lib runtime graph has no extensionless relative imports', () => {
    const root = process.cwd()
    const importFrom = /import\s+(type\s+)?(?:[\w*\s{},$]+?)\s+from\s+['"]([^'"]+)['"]/g
    const dynImport = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

    function runtimeSpecs(text: string): string[] {
      const out: string[] = []
      for (const m of text.matchAll(importFrom)) {
        if (m[1]) continue
        out.push(m[2])
      }
      for (const m of text.matchAll(dynImport)) out.push(m[1])
      return out
    }

    function resolveTs(fromFile: string, spec: string): string | null {
      const cleaned = spec.replace(/\.js$/, '')
      if (!cleaned.startsWith('.')) return null
      const base = resolve(dirname(fromFile), cleaned)
      for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
        try {
          readFileSync(cand)
          return cand
        } catch {
          /* missing */
        }
      }
      return null
    }

    function listTs(dir: string): string[] {
      const out: string[] = []
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name)
        if (ent.isDirectory()) out.push(...listTs(p))
        else if (ent.name.endsWith('.ts') && !ent.name.includes('.test.') && !ent.name.includes('.spec.')) {
          out.push(p)
        }
      }
      return out
    }

    const start = new Set<string>()
    for (const file of listTs(join(root, 'server'))) {
      const text = readFileSync(file, 'utf8')
      for (const spec of runtimeSpecs(text)) {
        const m = spec.match(/src\/(lib|types)\/(.+?)(?:\.js)?$/)
        if (!m) continue
        const cand = join(root, 'src', m[1], `${m[2]}.ts`)
        try {
          readFileSync(cand)
          start.add(cand)
        } catch {
          /* skip */
        }
      }
    }

    const visited = new Set<string>()
    const queue = [...start]
    const extless: string[] = []
    while (queue.length) {
      const cur = queue.pop()!
      if (visited.has(cur)) continue
      visited.add(cur)
      if (!cur.includes(`${join('src')}`)) continue
      const text = readFileSync(cur, 'utf8')
      for (const spec of runtimeSpecs(text)) {
        if (!spec.startsWith('.')) continue
        const hasExt = /\.(js|json)$/.test(spec)
        if (!hasExt) {
          extless.push(`${cur.replace(root + '/', '')}: ${spec}`)
        }
        const target = resolveTs(cur, spec)
        if (target && target.includes(`${join('src')}`) && !visited.has(target)) {
          queue.push(target)
        }
      }
    }

    expect(extless, `extensionless ESM imports break Vercel /var/task: ${extless.join('; ')}`).toEqual([])
  })
})
