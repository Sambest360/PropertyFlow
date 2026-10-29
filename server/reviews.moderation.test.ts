import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Hiding / unhiding a review is super admin only. Agency staff (admins and
 * field agents) can still reply, but could otherwise hide bad reviews of their
 * own listings, or of themselves.
 */
const REVIEW = 'r0000001-0001-4000-8000-000000000001'
const AGENCY = 'a1000001-0001-4000-8000-000000000001'
const UNIT = 'u0000001-0001-4000-8000-000000000001'
const ME = 'c0000001-0001-4000-8000-000000000001'

const query = vi.hoisted(() => vi.fn())
vi.mock('./db.js', () => ({ query: (...a: unknown[]) => query(...a) }))
vi.mock('./entityMap.js', () => ({ resolveUuid: vi.fn(async () => ME) }))
vi.mock('./listingUuid.js', () => ({ resolveListingUnitUuid: vi.fn(async () => UNIT) }))
vi.mock('./supportDesk.js', () => ({ notifyUsers: vi.fn(async () => 0), superAdminUuids: vi.fn(async () => []) }))

type Actor = { userId: string; role: string; agencyId: string | null }
const actor = (role: string): Actor => ({ userId: 'u-me', role, agencyId: role === 'super_admin' ? null : 'ag-1' })

beforeEach(() => {
  query.mockReset()
  query.mockImplementation(async (sql: string) => {
    if (/FROM reviews WHERE id =/.test(sql)) {
      return [{ id: REVIEW, unit_id: UNIT, client_id: AGENCY, author_user_id: 'someone-else', author_name: 'Thandi Mokoena' }]
    }
    // canManage: the actor works for the listing's agency.
    if (/SELECT client_id = \$2::uuid AS ok FROM users/.test(sql)) return [{ ok: true }]
    if (/FROM units u LEFT JOIN buildings/.test(sql)) {
      return [{ id: UNIT, client_id: AGENCY, agent_id: null, landlord_id: null, title: 'Unit 1' }]
    }
    if (/SELECT TRIM\(CONCAT_WS/.test(sql)) return [{ name: 'Anya Botha' }]
    if (/SELECT company_name AS name FROM clients/.test(sql)) return [{ name: 'Algoa Bay Estates' }]
    return []
  })
})

const moderated = () => query.mock.calls.some(([sql]) => /UPDATE reviews SET status = \$2/.test(String(sql)))

describe('review moderation is super admin only', () => {
  for (const role of ['client_admin', 'agent_admin', 'ground_agent', 'agent']) {
    it(`${role} of the listing's agency cannot hide or unhide, and nothing is written`, async () => {
      const { actOnReview } = await import('./reviews.js')
      for (const status of ['hidden', 'published']) {
        await expect(actOnReview(actor(role) as never, REVIEW, { action: 'moderate', status })).rejects.toMatchObject({
          status: 403,
        })
      }
      expect(moderated()).toBe(false)
    })
  }

  it('agency staff can still reply', async () => {
    const { actOnReview } = await import('./reviews.js')
    await expect(actOnReview(actor('ground_agent') as never, REVIEW, { action: 'respond', body: 'Thank you!' })).resolves.toEqual({
      ok: true,
    })
    expect(query.mock.calls.some(([sql]) => /UPDATE reviews SET response_body/.test(String(sql)))).toBe(true)
  })

  it('the super admin can hide and unhide', async () => {
    const { actOnReview } = await import('./reviews.js')
    await expect(actOnReview(actor('super_admin') as never, REVIEW, { action: 'moderate', status: 'hidden' })).resolves.toEqual({
      ok: true,
      status: 'hidden',
    })
    expect(moderated()).toBe(true)
  })

  it('only the super admin opens the moderation queue', async () => {
    const { moderationQueue } = await import('./reviews.js')
    await expect(moderationQueue(actor('client_admin') as never)).rejects.toMatchObject({ status: 403 })
    await expect(moderationQueue(actor('super_admin') as never)).resolves.toEqual([])
  })

  it('tells the reviews screen who may moderate', async () => {
    const { listReviews } = await import('./reviews.js')
    const staff = await listReviews(actor('agent_admin') as never, 'P-1')
    expect(staff).toMatchObject({ canManage: true, canModerate: false })
    const admin = await listReviews(actor('super_admin') as never, 'P-1')
    expect(admin).toMatchObject({ canManage: true, canModerate: true })
    const guest = await listReviews(null, 'P-1')
    expect(guest).toMatchObject({ canManage: false, canModerate: false })
  })
})
