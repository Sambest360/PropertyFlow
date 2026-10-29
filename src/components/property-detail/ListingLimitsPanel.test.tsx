import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WaitlistList } from './ListingLimitsPanel'
import { LISTING_LIMITS_READ_ONLY_NOTE } from '../../lib/waitlistAccess'

// Round 4 (Oscar / P2): a landlord reaches this panel (assets.manage) and may see
// the counts, but limit edits, resets and promotions stay staff-only.
const SRC = readFileSync(resolve(__dirname, 'ListingLimitsPanel.tsx'), 'utf8')
const people = [{ id: 'w1', name: 'Wait Lister', email: 'w@example.invalid' }]

describe('ListingLimitsPanel: landlords get no edit controls', () => {
  it('WaitlistList shows Promote only when a promote handler is given', () => {
    expect(renderToStaticMarkup(<WaitlistList title="Viewing waitlist" people={people} busy={false} onPromote={() => {}} />)).toContain('Promote')
    expect(renderToStaticMarkup(<WaitlistList title="Viewing waitlist" people={people} busy={false} />)).not.toContain('Promote')
  })

  it('the caps, radios, checkbox, Save limits and Reset sit behind viewerIsStaff; landlords get the read-only note', () => {
    const gate = SRC.indexOf('{viewerIsStaff ? (')
    const readOnly = SRC.indexOf('{LISTING_LIMITS_READ_ONLY_NOTE}')
    expect(gate).toBeGreaterThan(0)
    for (const control of ['Max enquiries', 'Max viewings', 'type="radio"', 'type="checkbox"', 'Save limits', 'Reset counters / reopen']) {
      const at = SRC.indexOf(control)
      expect(at, control).toBeGreaterThan(gate)
      expect(at, control).toBeLessThan(readOnly)
    }
    expect(SRC).toContain("onPromote={viewerIsStaff ? (id) => void promote('viewing', id) : undefined}")
    expect(SRC).toContain("onPromote={viewerIsStaff ? (id) => void promote('lead', id) : undefined}")
    expect(LISTING_LIMITS_READ_ONLY_NOTE).toMatch(/managed by the agency/)
  })
})
