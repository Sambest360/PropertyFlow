import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** CR10 N3: a committed lease_signed row is never deleted by any server path. */
function serverFiles(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) serverFiles(p, out)
    else if (/\.ts$/.test(n) && !/\.test\.ts$/.test(n)) out.push(p)
  }
  return out
}

describe('no DELETE of lease_signed rows anywhere in server/', () => {
  const files = serverFiles('server')
  it('every DELETE on event_log is scoped to support_ticket rows only', () => {
    const hits: string[] = []
    for (const f of files) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/DELETE\s+FROM\s+"?event_log"?/i.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`)
        })
    }
    for (const h of hits) expect(h, h).toMatch(/event_type = 'support_ticket'/)
    expect(hits.join('\n')).not.toMatch(/lease_signed/)
  })
  it('the sign code has no undo / DELETE path', () => {
    const src = readFileSync('server/leaseSign.ts', 'utf8')
    expect(src).not.toMatch(/DELETE\s+FROM/i)
    expect(src).not.toMatch(/undoStaffStamp|signUndo/)
  })
  it('a client delete aimed at lease_signed is refused by the gate', async () => {
    const { isClientLeaseSignedWrite } = await import('./leaseSign.js')
    expect(isClientLeaseSignedWrite({ resource: 'lease_signed' })).toBe(true)
  })
})
