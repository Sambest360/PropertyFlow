import { afterEach, describe, expect, it } from 'vitest'
import {
  arePageTipsDisabled,
  clearAllPageTips,
  clearPageTipsForUser,
  clearPageTipsPreference,
  ensurePageTipsPreferenceForFirstVisit,
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
  it('returns multi-step market home tour on first visit shape', () => {
    const tour = resolvePageTour('/', null)
    expect(tour?.id).toBe('tour-market-home')
    expect(tour?.steps.length).toBeGreaterThan(1)
    expect(tour?.steps[0].target).toBeUndefined()
  })

  it('returns property create walkthrough with wizard targets', () => {
    const tour = resolvePageTour('/workspace/properties/new', 'agent_admin')
    expect(tour?.id).toBe('tour-property-create')
    expect(tour?.steps.some((s) => s.target?.includes('wizard-steps'))).toBe(true)
    expect(tour?.steps.some((s) => s.target?.includes('wizard-form'))).toBe(true)
  })

  it('keeps existing browse and workspace walkthrough routes unchanged', () => {
    const browse = resolvePageTour('/browse', null)
    expect(browse?.id).toBe('tour-market-browse')
    expect(browse?.steps[0].target).toContain('market-nav')

    const workspace = resolvePageTour('/workspace', 'agent_admin')
    expect(workspace?.id).toBe('tour-workspace-home')
    expect(workspace?.steps[0].target).toBeUndefined()
    expect(workspace?.steps.some((s) => s.target?.includes('workspace-nav'))).toBe(true)
  })

  it('adds guest saved and calculators walkthroughs', () => {
    expect(resolvePageTour('/saved', null)?.id).toBe('tour-market-saved')
    expect(resolvePageTour('/calculators', null)?.id).toBe('tour-market-calculators')
    // Tool subroutes use CalculatorShell (no calc-tools target) — index-only tour.
    expect(resolvePageTour('/calculators/mortgage-bond', null)).toBeNull()
    expect(resolvePageTour('/calculators/affordability', null)).toBeNull()
  })

  it('adds staff list walkthroughs with welcome-then-target shape', () => {
    const props = resolvePageTour('/workspace/properties', 'agent_admin')
    expect(props?.id).toBe('tour-properties-list')
    expect(props?.steps[0].target).toBeUndefined()
    expect(props?.steps.some((s) => s.target?.includes('page-header'))).toBe(true)

    expect(resolvePageTour('/workspace/sales/crm', 'ground_agent')?.id).toBe('tour-sales-crm')
    expect(resolvePageTour('/workspace/operations/payments', 'ground_agent')?.id).toBe(
      'tour-ops-payments',
    )
    expect(resolvePageTour('/workspace/operations/payments', 'agent')).toBeNull()
    expect(resolvePageTour('/workspace/trust/unallocated', 'ground_agent')).toBeNull()
    expect(resolvePageTour('/workspace/trust/unallocated', 'agent_admin')?.id).toBe(
      'tour-trust-unallocated',
    )
  })


  it('excludes landlord from staff list walkthroughs', () => {
    expect(resolvePageTour('/workspace/properties', 'landlord')).toBeNull()
    expect(resolvePageTour('/workspace/operations/maintenance', 'landlord')).toBeNull()
    expect(resolvePageTour('/workspace/operations/payments', 'landlord')).toBeNull()
    expect(resolvePageTour('/workspace/operations/documents', 'landlord')).toBeNull()
    expect(resolvePageTour('/workspace/people/landlords', 'landlord')).toBeNull()
    expect(resolvePageTour('/workspace/portals/owner', 'landlord')).toBeNull()
  })

  it('adds super-admin and tenant portal walkthroughs', () => {
    expect(resolvePageTour('/workspace/admin/agencies', 'super_admin')?.id).toBe(
      'tour-admin-agencies',
    )
    expect(resolvePageTour('/workspace/admin/all-users', 'super_admin')?.id).toBe(
      'tour-admin-all-users',
    )
    expect(resolvePageTour('/workspace', 'super_admin')).toBeNull()

    expect(resolvePageTour('/workspace/portals/tenant', 'tenant')?.id).toBe(
      'tour-portal-tenant-home',
    )
    expect(resolvePageTour('/workspace/account/wishlist', 'tenant')?.id).toBe(
      'tour-account-wishlist',
    )
  })

  it('gates tenant maintenance messages and complaints on occupancy', () => {
    expect(
      resolvePageTour('/workspace/portals/tenant/maintenance', 'tenant', {
        tenantOccupancyReady: false,
      }),
    ).toBeNull()
    expect(
      resolvePageTour('/workspace/portals/tenant/maintenance', 'tenant', {
        tenantOccupancyReady: true,
      })?.id,
    ).toBe('tour-portal-tenant-maintenance')
    expect(
      resolvePageTour('/workspace/portals/tenant/messages', 'tenant', {
        tenantOccupancyReady: true,
      })?.id,
    ).toBe('tour-portal-tenant-messages')
    expect(
      resolvePageTour('/workspace/portals/tenant/complaints', 'tenant', {
        tenantOccupancyReady: false,
      }),
    ).toBeNull()
  })

  it('shows nothing on record pages', () => {
    expect(resolvePageTour('/workspace/properties/p-1', 'agent_admin')).toBeNull()
    expect(resolvePageTour('/workspace/properties/p-1/edit', 'agent_admin')).toBeNull()
    expect(resolvePageTour('/listing/abc', null)).toBeNull()
    expect(resolvePageTour('/workspace/sales/crm/lead-1', 'agent_admin')).toBeNull()
    expect(resolvePageTour('/workspace/sales/applications/app-1', 'agent_admin')).toBeNull()
    expect(resolvePageTour('/workspace/operations/payments/pay-1', 'agent_admin')).toBeNull()
    expect(
      resolvePageTour('/workspace/portals/tenant/applications/app-1', 'tenant'),
    ).toBeNull()
  })

  it('does not fall back to single-step tips on routes without a walkthrough', () => {
    // Help has no walkthrough; single-step RULES catalog stays unused for walkthroughs.
    expect(resolvePageTour('/workspace/help', 'agent_admin')).toBeNull()
  })

  it('tracks seen tours per user so skip stays dismissed for that page', () => {
    const tour = resolvePageTour('/workspace/properties', 'agent_admin')
    expect(tour).not.toBeNull()
    expect(hasSeenPageTip('u-test', tour!.id)).toBe(false)
    markPageTipSeen('u-test', tour!.id)
    expect(hasSeenPageTip('u-test', tour!.id)).toBe(true)
  })
})

describe('page tip preferences', () => {
  it('defaults to no preference for new users', () => {
    expect(hasPageTipsPreference('u-test')).toBe(false)
    expect(arePageTipsDisabled('u-test')).toBe(false)
  })

  it('persists global disable so the preference gate turns tips off', () => {
    setPageTipsPreference('u-test', true)
    expect(hasPageTipsPreference('u-test')).toBe(true)
    expect(arePageTipsDisabled('u-test')).toBe(true)
  })

  it('ensurePageTipsPreferenceForFirstVisit defaults tips off without a tour page', () => {
    ensurePageTipsPreferenceForFirstVisit('u-test', false)
    expect(hasPageTipsPreference('u-test')).toBe(false)
  })

  it('ensurePageTipsPreferenceForFirstVisit records opt-out when a tour exists (FW-05)', () => {
    const tour = resolvePageTour('/workspace/portals/tenant', 'tenant')
    expect(tour).not.toBeNull()
    ensurePageTipsPreferenceForFirstVisit('u-test', true)
    expect(hasPageTipsPreference('u-test')).toBe(true)
    expect(arePageTipsDisabled('u-test')).toBe(true)
  })

  it('ensurePageTipsPreferenceForFirstVisit is idempotent', () => {
    ensurePageTipsPreferenceForFirstVisit('u-test', true)
    setPageTipsPreference('u-test', false)
    ensurePageTipsPreferenceForFirstVisit('u-test', true)
    expect(arePageTipsDisabled('u-test')).toBe(false)
  })

  it('tenant portal first visit records opt-out so revisits do not re-prompt (FW-27 P13)', () => {
    const path = '/workspace/portals/tenant'
    const tour = resolvePageTour(path, 'tenant')
    expect(tour).not.toBeNull()
    expect(hasPageTipsPreference('u-test')).toBe(false)

    ensurePageTipsPreferenceForFirstVisit('u-test', Boolean(tour))
    expect(hasPageTipsPreference('u-test')).toBe(true)
    expect(arePageTipsDisabled('u-test')).toBe(true)

    // Simulate navigate away and back — preference must stay decided.
    ensurePageTipsPreferenceForFirstVisit('u-test', Boolean(resolvePageTour(path, 'tenant')))
    expect(arePageTipsDisabled('u-test')).toBe(true)
  })
})

describe('tour session cooldown', () => {
  it('still records a cooldown when a tip is marked seen', () => {
    expect(isTourSessionCooldownActive()).toBe(false)
    markTourSessionCooldown()
    expect(isTourSessionCooldownActive()).toBe(true)
  })

  it('seeing one page does not block the next page first visit in the same sitting', () => {
    markPageTipSeen('u-test', 'tour-market-home')
    expect(hasSeenPageTip('u-test', 'tour-market-home')).toBe(true)
    expect(isTourSessionCooldownActive()).toBe(true)

    // Cooldown is active, but the next page still resolves a walkthrough and
    // has not been marked seen — usePageTour no longer gates on the cooldown.
    const next = resolvePageTour('/saved', null)
    expect(next?.id).toBe('tour-market-saved')
    expect(hasSeenPageTip('u-test', next!.id)).toBe(false)

    const staffNext = resolvePageTour('/workspace/properties', 'agent_admin')
    expect(staffNext?.id).toBe('tour-properties-list')
    expect(hasSeenPageTip('u-test', staffNext!.id)).toBe(false)
  })
})

describe('resolvePageTip catalog (unused by walkthrough UI)', () => {
  it('still resolves single-step catalog entries for compatibility', () => {
    expect(resolvePageTip('/workspace/sales/applications', 'agent_admin')).not.toBeNull()
  })
})

describe('Spec 3 tour copy and targets', () => {
  it('tour-trust-payouts step 2 targets the Propose payout panel', () => {
    const tour = resolvePageTour('/workspace/trust/payouts', 'agent_admin')
    expect(tour?.id).toBe('tour-trust-payouts')
    expect(tour?.steps[1]?.target).toBe('[data-tip-target="trust-propose-payout"]')
    expect(tour?.steps[1]?.body).toBe(
      'Propose a payout here. Approve it or submit it from its row in the list.',
    )
  })

  it('tour-insights-reports step 2 targets the report tab bar', () => {
    const tour = resolvePageTour('/workspace/insights/reports', 'agent_admin')
    expect(tour?.steps[1]?.target).toBe('[data-tip-target="report-tabs"]')
    expect(tour?.steps[1]?.body).toBe('Pick a report tab, then set the dates.')
  })

  it('tour-insights-reports step 1 is neutral for every role, including super admin', () => {
    for (const role of ['super_admin', 'client_admin', 'agent_admin'] as const) {
      const tour = resolvePageTour('/workspace/insights/reports', role)
      expect(tour?.steps[0]?.body).toBe('Pick a report tab, then export.')
    }
  })

  it('tour-trust-arrears step 2 targets the first-row message button', () => {
    const tour = resolvePageTour('/workspace/trust/arrears', 'agent_admin')
    expect(tour?.id).toBe('tour-trust-arrears')
    expect(tour?.steps[1]?.target).toBe('[data-tip-target="trust-arrears-message"]')
  })

  it('tour-trust-unallocated step 2 targets the allocation selection panel', () => {
    const tour = resolvePageTour('/workspace/trust/unallocated', 'agent_admin')
    expect(tour?.id).toBe('tour-trust-unallocated')
    expect(tour?.steps[1]?.target).toBe('[data-tip-target="trust-unallocated-selection"]')
    expect(tour?.steps[1]?.body).toBe('Select a receipt. Allocate it from the selection panel.')
  })
})
