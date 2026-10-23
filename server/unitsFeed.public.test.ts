import { describe, expect, it, vi } from 'vitest'

/** GET /api/v1/units is signed-out: only publicly listed units, same rule as the 027 RPC. */
const query = vi.hoisted(() => vi.fn(async () => []))
vi.mock('./db.js', () => ({ query: (...args: unknown[]) => query(...(args as [])) }))

describe('fetchUnitsPage public filter', () => {
  it('filters to public statuses or an occupied advert, excludes unlisted and unverified landlords', async () => {
    const { fetchUnitsPage } = await import('./unitsFeed.js')
    await fetchUnitsPage({ limit: 10 })
    const sql = String((query.mock.calls[0] as unknown[])[0])
    expect(sql).toContain("u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')")
    expect(sql).toContain("lower(coalesce(u.listing_type, 'rent')) <> 'not_listed'")
    expect(sql).toMatch(/u\.advertise_while_occupied = true\s+AND u\.available_from IS NOT NULL\s+AND upper\(u\.status_config_key\) = 'OCCUPIED'/)
    expect(sql).toContain("coalesce(ll.metadata->'verification'->>'status', 'approved') NOT IN ('pending', 'rejected')")
    expect(sql).not.toContain('WHERE 1=1')
    expect(sql).not.toMatch(/ll\.(email|phone|first_name|last_name)/)
  })
})
