import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Always-on guard (no database): `units` has no landlord_id column in
 * database/postgres/schema.sql (landlord_id is on buildings and leases), so no
 * server SQL may read un.landlord_id. Jim #121 review item 4 / proof 20: that
 * join made every listing-enquiry agent alert fail. The real-Postgres proof is
 * listingAlertStaff.pg.test.ts (runs with PF_TEST_PG_URL).
 */
const SERVER = join(process.cwd(), 'server')
const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    return /\.ts$/.test(e.name) && !/\.(test|spec)\.ts$/.test(e.name) ? [p] : []
  })

describe('no server SQL joins on units.landlord_id', () => {
  it('schema.sql: CREATE TABLE units has no landlord_id column', () => {
    const schema = readFileSync(join(process.cwd(), 'database/postgres/schema.sql'), 'utf8')
    const units = schema.match(/CREATE TABLE units \(([\s\S]*?)\n\);/)
    expect(units).not.toBeNull()
    expect(units![1]).not.toMatch(/\blandlord_id\b/)
  })

  it('no non-test file under server/ contains un.landlord_id or units.landlord_id', () => {
    const hits = sources(SERVER).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => ({ f, i: i + 1, line }))
        .filter(({ line }) => /\b(un|units)\.landlord_id\b/.test(line))
        .map(({ f, i }) => `${f.slice(process.cwd().length + 1)}:${i}`),
    )
    expect(hits).toEqual([])
  })

  it('the listing-enquiry route uses loadListingAlertStaff (the SQL the PG test runs)', () => {
    const index = readFileSync(join(SERVER, 'index.ts'), 'utf8')
    expect(index).toMatch(/loadListingAlertStaff\(result\.unitId \?\? null\)/)
  })
})
