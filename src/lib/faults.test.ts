import { describe, expect, it } from 'vitest'
import { faultActionRefusal, faultAge, faultStatusLabel, faultUrgencyLabel, similarOpenFaults } from './faults'

describe('tenant fault rules', () => {
  it('lets the reporter confirm or reopen only once it is marked fixed', () => {
    expect(faultActionRefusal('reporter', 'OPEN', { action: 'confirm', body: '' })).toMatch(/not marked fixed/)
    expect(faultActionRefusal('reporter', 'COMPLETED', { action: 'confirm', body: '', rating: 5 })).toBeNull()
    expect(faultActionRefusal('reporter', 'COMPLETED', { action: 'confirm', body: '', rating: 7 })).toMatch(/1 to 5/)
    expect(faultActionRefusal('reporter', 'COMPLETED', { action: 'reopen', body: '' })).toMatch(/still wrong/)
    expect(faultActionRefusal('reporter', 'COMPLETED', { action: 'reopen', body: 'Still dripping' })).toBeNull()
  })

  it('keeps confirm / reopen to the tenant and internal notes to staff', () => {
    for (const who of ['staff', 'landlord', 'contractor'] as const) {
      expect(faultActionRefusal(who, 'COMPLETED', { action: 'confirm', body: '' })).not.toBeNull()
    }
    expect(faultActionRefusal('reporter', 'OPEN', { action: 'reply', body: 'x', internal: true })).toMatch(/staff/)
    expect(faultActionRefusal('landlord', 'OPEN', { action: 'reply', body: 'x', internal: true })).toMatch(/staff/)
    expect(faultActionRefusal('staff', 'OPEN', { action: 'reply', body: 'x', internal: true })).toBeNull()
    expect(faultActionRefusal('reporter', 'OPEN', { action: 'reply', body: '  ' })).not.toBeNull()
  })

  it('uses tenant words for urgency and status', () => {
    expect(faultUrgencyLabel('Emergency')).toBe('Emergency')
    expect(faultUrgencyLabel('High')).toBe('Urgent')
    expect(faultUrgencyLabel('Medium')).toBe('Routine')
    expect(faultStatusLabel('Requested')).toBe('Reported')
    expect(faultStatusLabel('Completed')).toBe('Fixed')
  })

  it('marks an emergency overdue after 4 hours, a routine fault after a week', () => {
    const opened = '2026-10-20T08:00:00.000Z'
    const now = new Date(opened).getTime() + 5 * 3_600_000
    expect(faultAge({ openedAt: '2026-10-20', openedAtIso: opened, priority: 'Emergency', status: 'Requested' }, now).overdue).toBe(true)
    expect(faultAge({ openedAt: '2026-10-20', openedAtIso: opened, priority: 'Medium', status: 'Requested' }, now).overdue).toBe(false)
    expect(faultAge({ openedAt: '2026-10-20', openedAtIso: opened, priority: 'Emergency', status: 'Completed' }, now).overdue).toBe(false)
  })

  it('hints at a duplicate by category or shared words, ignoring closed faults', () => {
    const faults = [
      { title: 'Geyser leaking in bathroom', status: 'Requested' as const, categoryKey: 'GEYSER' },
      { title: 'Broken window latch', status: 'Completed' as const, categoryKey: 'WINDOWS' },
    ]
    expect(similarOpenFaults({ title: 'Water from geyser', categoryKey: 'geyser' }, faults)).toHaveLength(1)
    expect(similarOpenFaults({ title: 'Geyser leaking again' }, faults)).toHaveLength(1)
    expect(similarOpenFaults({ title: 'Window latch broken', categoryKey: 'WINDOWS' }, faults)).toHaveLength(0)
  })
})
