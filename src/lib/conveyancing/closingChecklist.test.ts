import { describe, expect, it } from 'vitest'
import {
  CLOSING_CHECKLIST_ITEMS,
  CLOSING_CHECKLIST_KEYS,
  CONVEYANCING_MODE_A_COPY,
  closingChecklistProgress,
  midTransferDemoChecklist,
} from './closingChecklist'

describe('purchase closing checklist (Mode A)', () => {
  it('exposes staff-recorded checklist items without inventing live deeds/bank facts', () => {
    expect(CLOSING_CHECKLIST_KEYS.length).toBeGreaterThan(5)
    const joined = CLOSING_CHECKLIST_ITEMS.map((i) => `${i.label} ${i.hint}`).join(' ')
    expect(joined).toMatch(/not live Deeds Office/i)
    expect(joined).not.toMatch(/e-filing success/i)
    expect(joined).not.toMatch(/successfully lodged/i)
    expect(joined).toMatch(/Staff/)
  })

  it('computes progress from manual ticks', () => {
    const mid = midTransferDemoChecklist()
    const { done, total, pct } = closingChecklistProgress(mid)
    expect(total).toBe(CLOSING_CHECKLIST_KEYS.length)
    expect(done).toBe(6)
    expect(pct).toBeGreaterThan(0)
    expect(pct).toBeLessThan(100)
    expect(mid.attorneyFirmNote).toMatch(/demo note/i)
  })
})

describe('conveyancing Mode A honesty copy', () => {
  it('states Mode A and denies live attorney / Deeds / quote', () => {
    expect(CONVEYANCING_MODE_A_COPY).toMatch(/Non-production conveyancing/i)
    expect(CONVEYANCING_MODE_A_COPY).toMatch(/staff-recorded/i)
    expect(CONVEYANCING_MODE_A_COPY).toMatch(/not a live attorney portal/i)
    expect(CONVEYANCING_MODE_A_COPY).toMatch(/not a quote/i)
    expect(CONVEYANCING_MODE_A_COPY).not.toMatch(/successfully lodged at the Deeds Office/i)
  })
})
