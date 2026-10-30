import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * H1 (Jim C10): the staff lead screen shows the walk-in help in its subtitle
 * and its empty state. Source check only; the rendered page is an owed
 * browser check in the PR.
 */
describe('H1 lead screen walk-in help wiring', () => {
  it('CRM.tsx uses LEAD_SCREEN_WALK_IN_HELP in the subtitle and the empty-state hint', () => {
    const src = readFileSync(join(__dirname, 'CRM.tsx'), 'utf8')
    expect(src).toMatch(/subtitle=\{`[^`]*\$\{LEAD_SCREEN_WALK_IN_HELP\}`\}/)
    expect(src).toMatch(/hint=\{`[^`]*\$\{LEAD_SCREEN_WALK_IN_HELP\}`\}/)
  })
})
