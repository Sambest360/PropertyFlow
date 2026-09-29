import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const BCRYPT = /\$2[aby]\$\d{2}\$[./0-9A-Za-z]{20,}/g
const CRYPT_LITERAL = /crypt\(\s*'[^']*'/gi
const ASSIGNED_PASSWORD =
  /(?:^|[^A-Za-z0-9_])(?:password|passwd|pwd)\s*(?::=|\?\?|=|:)\s*(['"])([^'"]+)\1/gi

export type SeedSafetyHit = { file: string; detail: string }

function walk(dir: string, acc: string[]): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      walk(path, acc)
      continue
    }
    acc.push(path)
  }
}

/** Files that define seed data or the scripts that load it. Tests are excluded. */
export function seedSafetyFiles(root = '.'): string[] {
  const found: string[] = []
  const consider = (path: string) => {
    const rel = relative(root, path).replaceAll('\\', '/')
    if (rel.endsWith('.test.ts') || rel.endsWith('.spec.ts')) return
    found.push(rel)
  }

  for (const path of [
    'database/seed.sql',
    'database/postgres/seed.sql',
    'database/postgres/seed_empty.sql',
    'database/postgres/seed_pe_bulk.sql',
    'supabase/seed.sql',
    'src/data/seed.ts',
    'src/data/seedTrust.ts',
    'scripts/create-super-admin.ts',
    'scripts/create-agency-admin.ts',
    'scripts/seed-local.ts',
    'scripts/seed-applicants.ts',
    'scripts/seed-supabase-demo.ts',
    'scripts/repair-auth-identities.ts',
  ]) {
    consider(join(root, path))
  }

  const trees = [join(root, 'database/fixtures'), join(root, 'scripts/seed')]
  for (const dir of trees) {
    const files: string[] = []
    walk(dir, files)
    for (const path of files) consider(path)
  }

  return [...new Set(found)].sort()
}

export function findSeedSafetyViolations(relPath: string, text: string): SeedSafetyHit[] {
  const hits: SeedSafetyHit[] = []
  for (const match of text.matchAll(EMAIL)) {
    if (!match[0].toLowerCase().endsWith('@example.test')) {
      hits.push({ file: relPath, detail: `email ${match[0]}` })
    }
  }
  for (const match of text.matchAll(BCRYPT)) {
    hits.push({ file: relPath, detail: `bcrypt hash ${match[0].slice(0, 12)}…` })
  }
  for (const match of text.matchAll(CRYPT_LITERAL)) {
    hits.push({ file: relPath, detail: `crypt() literal ${match[0]}` })
  }
  for (const match of text.matchAll(ASSIGNED_PASSWORD)) {
    hits.push({ file: relPath, detail: `hard-coded password assignment (${match[2]})` })
  }
  for (const line of text.split('\n')) {
    if (!/password/i.test(line)) continue
    if (/\?\?\s*['"][^'"]+['"]/.test(line)) {
      hits.push({ file: relPath, detail: `password fallback on line: ${line.trim()}` })
    }
  }
  return hits
}

export function scanSeedFiles(root = '.'): SeedSafetyHit[] {
  const hits: SeedSafetyHit[] = []
  for (const relPath of seedSafetyFiles(root)) {
    const text = readFileSync(join(root, relPath), 'utf8')
    hits.push(...findSeedSafetyViolations(relPath, text))
  }
  return hits
}
