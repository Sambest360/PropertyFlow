import { afterEach, describe, expect, it } from 'vitest'
import {
  arePageTipsDisabled,
  clearAllPageTips,
  clearPageTipsForUser,
  clearPageTipsPreference,
  hasPageTipsPreference,
  hasSeenPageTip,
  isTourSessionCooldownActive,
  markPageTipSeen,
  markTourSessionCooldown,
  resolvePageTip,
  resolvePageTour,
  setPageTipsPreference,
} from './pageTips'

afterEach(() => {
  clearPageTipsForUser('u-test')
  clearPageTipsPreference('u-test')
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

  it('does not fall back to single-step tips on unlisted routes', () => {
    expect(resolvePageTour('/workspace/sales/applications', 'agent_admin')).toBeNull()
    expect(resolvePageTip('/workspace/sales/applications', 'agent_admin')).not.toBeNull()
  })

  it('tracks seen tours per user', () => {
    markPageTipSeen('u-test', 'tour-property-create')
    expect(hasSeenPageTip('u-test', 'tour-property-create')).toBe(true)
  })
})

describe('page tip preferences', () => {
  it('defaults to no preference for new users', () => {
    expect(hasPageTipsPreference('u-test')).toBe(false)
    expect(arePageTipsDisabled('u-test')).toBe(false)
  })

  it('persists global disable', () => {
    setPageTipsPreference('u-test', true)
    expect(hasPageTipsPreference('u-test')).toBe(true)
    expect(arePageTipsDisabled('u-test')).toBe(true)
  })
})

describe('tour session cooldown', () => {
  it('blocks back-to-back tours in one session', () => {
    expect(isTourSessionCooldownActive()).toBe(false)
    markTourSessionCooldown()
    expect(isTourSessionCooldownActive()).toBe(true)
  })
})
