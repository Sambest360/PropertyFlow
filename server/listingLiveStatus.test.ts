import { beforeEach, describe, expect, it, vi } from 'vitest'

/** P4: only the owner changes a listing's live state. */
const query = vi.fn()
vi.mock('./db.js', () => ({ databaseConfigured: true, query: (...a: unknown[]) => query(...a), withTransaction: vi.fn(), clientQuery: vi.fn() }))
vi.mock('./entityMap.js', () => ({ resolveUuid: vi.fn(async (_t: string, fe: string) => (fe === 'u-missing' ? null : '00000000-0000-4000-8000-000000000001')) }))
vi.mock('./requestActor.js', () => ({ resolveRequestActor: vi.fn(async () => null) }))

const { listingLiveClass, liveChangeRefusal, actorIsOwner } = await import('./listingLiveStatus.js')
const { gateListingLive } = await import('./listingApprovals.js')

const row = (statusKey: string, over: Partial<{ listingType: string | null; featured: boolean; advertiseWhileOccupied: boolean; availableFrom: string | null }> = {}) => ({
  statusKey, listingType: 'RENT', featured: false, advertiseWhileOccupied: false, availableFrom: null, ...over,
})
const req = (statusKey: string, over: Partial<{ listingType: string | null; featured: boolean | undefined }> = {}) => ({
  statusKey, listingType: 'RENT' as string | null, featured: undefined as boolean | undefined, ...over,
})
const advert = row('OCCUPIED', { advertiseWhileOccupied: true, availableFrom: '2030-01-01' })

describe('listingLiveClass', () => {
  it('a. maps stored rows to live classes', () => {
    const table: Array<[ReturnType<typeof row>, string]> = [
      [row('PUBLISHED'), 'published'], [row('VACANT'), 'published'], [row('AVAILABLE'), 'published'],
      [row('FEATURED'), 'featured'], [row('PUBLISHED', { featured: true }), 'featured'],
      [row('UNDER_OFFER'), 'under_offer'],
      [row('DRAFT'), 'hidden'], [row('OFF_MARKET'), 'hidden'], [row('OCCUPIED'), 'hidden'], [row('MAINTENANCE'), 'hidden'], [row('DELETED'), 'hidden'], [row(' VACANT'), 'hidden'],
      [advert, 'published'], [{ ...advert, listingType: 'SALE' }, 'hidden'],
      [row('PUBLISHED', { listingType: 'NOT_LISTED' }), 'hidden'],
    ]
    expect(table.map(([r]) => listingLiveClass(r))).toEqual(table.map(([, c]) => c))
  })
})

const refused: Array<[string, ReturnType<typeof row> | null, ReturnType<typeof req>]> = [
  ['PUBLISHED->DRAFT', row('PUBLISHED'), req('DRAFT')],
  ['PUBLISHED->DELETED', row('PUBLISHED'), req('DELETED')],
  ['PUBLISHED->OCCUPIED', row('PUBLISHED'), req('OCCUPIED')],
  ['PUBLISHED->UNDER_OFFER', row('PUBLISHED'), req('UNDER_OFFER')],
  ['FEATURED->PUBLISHED', row('FEATURED'), req('PUBLISHED')],
  ['PUBLISHED RENT->NOT_LISTED', row('PUBLISHED'), req('PUBLISHED', { listingType: 'NOT_LISTED' })],
  ['featured on, live', row('PUBLISHED'), req('PUBLISHED', { featured: true })],
  ['featured on, draft', row('DRAFT'), req('DRAFT', { featured: true })],
  ['occupied advert->DRAFT', advert, req('DRAFT')],
  ['occupied advert RENT->SALE', advert, req('OCCUPIED', { listingType: 'SALE' })],
  ['new listing featured', null, req('DRAFT', { featured: true })],
]
const allowed: Array<[string, ReturnType<typeof row> | null, ReturnType<typeof req>]> = [
  ["VACANT stored, 'Published' resend", row('VACANT'), req('PUBLISHED')],
  ['featured stored, FEATURED + featured', row('PUBLISHED', { featured: true }), req('FEATURED', { featured: true })],
  ['DRAFT->OCCUPIED', row('DRAFT'), req('OCCUPIED')],
  ['DRAFT->MAINTENANCE', row('DRAFT'), req('MAINTENANCE')],
  ['DRAFT->PUBLISHED (the gate holds it)', row('DRAFT'), req('PUBLISHED')],
  ["' VACANT'->DRAFT", row(' VACANT'), req('DRAFT')],
  ['same-class detail resend', row('PUBLISHED'), req('PUBLISHED', { featured: false })],
]

describe('liveChangeRefusal', () => {
  it('b. a non-owner is refused every live-class change, and allowed the rest', () => {
    const r = (s: ReturnType<typeof row> | null, q: ReturnType<typeof req>) => liveChangeRefusal({ isOwner: false, stored: s, requested: q })
    expect(refused.filter(([, s, q]) => r(s, q) === null).map(([n]) => n), 'should be refused').toEqual([])
    expect(allowed.filter(([, s, q]) => r(s, q) !== null).map(([n]) => n), 'should be allowed').toEqual([])
  })
  it('c. the owner is allowed everything', () => {
    expect([...refused, ...allowed].filter(([, s, q]) => liveChangeRefusal({ isOwner: true, stored: s, requested: q }) !== null).map(([n]) => n)).toEqual([])
  })
})

describe('gateListingLive (P4)', () => {
  let approval: { status: string } | null = null
  const sqls: string[] = []
  beforeEach(() => {
    sqls.length = 0
    approval = null
    query.mockReset()
    query.mockImplementation(async (sql: string) => {
      sqls.push(sql)
      if (/SELECT status FROM listing_approvals/.test(sql)) return approval ? [approval] : []
      if (/INSERT INTO listing_approvals/.test(sql) && /'pending'/.test(sql)) return [{ fresh: false }]
      return []
    })
  })
  const base = { unitUuid: '0e000000-0000-4000-8000-000000000009', actorUserId: null }
  const pending = () => sqls.some((s) => /INSERT INTO listing_approvals/.test(s) && /'pending'/.test(s))
  const approved = () => sqls.some((s) => /INSERT INTO listing_approvals/.test(s) && /'approved'/.test(s))

  it('d1. non-owner, approved before, stored DRAFT, asks PUBLISHED -> DRAFT + pending', async () => {
    approval = { status: 'approved' }
    const out = await gateListingLive({ ...base, statusKey: 'PUBLISHED', storedStatus: 'DRAFT', actorRole: 'agent_admin', actorIsOwner: false })
    expect({ out, pending: pending() }).toEqual({ out: 'DRAFT', pending: true })
  })
  it('d2. an Administrator (super_admin, not the owner) goes down the pending path', async () => {
    const out = await gateListingLive({ ...base, statusKey: 'PUBLISHED', storedStatus: 'DRAFT', actorRole: 'super_admin', actorIsOwner: false })
    expect({ out, pending: pending(), approved: approved() }).toEqual({ out: 'DRAFT', pending: true, approved: false })
  })
  it('d3. the owner publishes and the row is approved', async () => {
    const out = await gateListingLive({ ...base, statusKey: 'PUBLISHED', storedStatus: 'DRAFT', actorRole: 'super_admin', actorIsOwner: true })
    expect({ out, approved: approved() }).toEqual({ out: 'PUBLISHED', approved: true })
  })
  it('d4. non-owner, stored PUBLISHED, asks VACANT -> VACANT with no write', async () => {
    const out = await gateListingLive({ ...base, statusKey: 'VACANT', storedStatus: 'PUBLISHED', actorRole: 'agent_admin', actorIsOwner: false })
    expect({ out, writes: sqls.filter((s) => /INSERT|UPDATE/.test(s)).length }).toEqual({ out: 'VACANT', writes: 0 })
  })
})

describe('actorIsOwner', () => {
  const rowFor = (r: { role: string; metadata: Record<string, unknown> } | 'throw' | null) => {
    query.mockReset()
    query.mockImplementation(async () => {
      if (r === 'throw') throw new Error('db down')
      return r ? [r] : []
    })
  }
  it('e. true only for the full super admin; everything else (and any error) is false', async () => {
    const out: boolean[] = []
    rowFor({ role: 'SUPER_ADMIN', metadata: {} }); out.push(await actorIsOwner('super_admin', 'u-owner'))
    rowFor({ role: 'SUPER_ADMIN', metadata: { platform_tier: 'administrator' } }); out.push(await actorIsOwner('super_admin', 'u-adm'))
    rowFor({ role: 'AGENT_ADMIN', metadata: {} }); out.push(await actorIsOwner('super_admin', 'u-agent'))
    rowFor({ role: 'SUPER_ADMIN', metadata: {} }); out.push(await actorIsOwner('agent_admin', 'u-owner'))
    rowFor(null); out.push(await actorIsOwner('super_admin', 'u-missing'))
    rowFor('throw'); out.push(await actorIsOwner('super_admin', 'u-owner'))
    expect(out).toEqual([true, false, false, false, false, false])
  })
})
