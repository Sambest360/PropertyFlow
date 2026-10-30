import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * H1 (spec r5 :41, Jim C3): every server site that wanted the client IP goes
 * through server/clientIp.ts. A guard over the server sources: no other file
 * reads X-Forwarded-For or X-Real-IP itself.
 */
describe('H1 client IP call sites', () => {
  it('no server source outside clientIp.ts reads X-Forwarded-For / X-Real-IP', () => {
    const dir = join(__dirname)
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'clientIp.ts')
      .filter((f) => /x-forwarded-for|x-real-ip/i.test(readFileSync(join(dir, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
