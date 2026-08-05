import { afterEach, describe, expect, it } from 'vitest'
import {
  clearAllPageTips,
  clearPageTipsForUser,
  hasSeenPageTip,
  markPageTipSeen,
  resolvePageTour,
} from './pageTips'

afterEach(() => {
  clearPageTipsForUser('u-test')
  clearAllPageTips()
})

describe('resolvePageTour', () => {
  it('returns multi-step market home tour', () => {
    const tour = resolvePageTour('/', null)
    expect(tour?.id).toBe('tour-market-home')
    expect(tour?.steps.length).toBeGreaterThan(1)
  })

  it('returns property create walkthrough with wizard targets', () => {
    const tour = resolvePageTour('/workspace/properties/new', 'agent_admin')
    expect(tour?.id).toBe('tour-property-create')
    expect(tour?.steps.some((s) => s.target?.includes('wizard-steps'))).toBe(true)
    expect(tour?.steps.some((s) => s.target?.includes('wizard-form'))).toBe(true)
  })

  it('skips impersonation via hook — storage still per user', () => {
    markPageTipSeen('u-test', 'tour-property-create')
    expect(hasSeenPageTip('u-test', 'tour-property-create')).toBe(true)
  })
})
