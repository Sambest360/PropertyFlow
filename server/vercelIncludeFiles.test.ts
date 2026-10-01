import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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
})
