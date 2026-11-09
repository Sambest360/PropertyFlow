import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** MKT-2: VACANT needs super-admin approval like PUBLISHED; one public-status set. */
const sqls: string[] = []
const approval: { row: { status: string } | null } = { row: null }

vi.mock('./db.js', () => ({
  query: vi.fn(async (sql: string) => {
    sqls.push(sql)
    if (/SELECT status FROM listing_approvals/.test(sql)) return approval.row ? [approval.row] : []
    if (/INSERT INTO listing_approvals/.test(sql) && /'pending'/.test(sql)) return [{ fresh: true }]
    return []
  }),
}))
vi.mock('./entityMap.js', () => ({ resolveUuid: vi.fn(async () => null) }))
vi.mock('./requestActor.js', () => ({ resolveRequestActor: vi.fn(async () => null) }))

const base = { unitUuid: '0e000000-0000-4000-8000-000000000001', storedStatus: 'DRAFT', actorUserId: null, actorIsOwner: false }
const pendingInsert = () => sqls.some((s) => /INSERT INTO listing_approvals/.test(s) && /'pending'/.test(s))
const approvedUpsert = () => sqls.some((s) => /INSERT INTO listing_approvals/.test(s) && /'approved'/.test(s))
const approvalLookup = () => sqls.some((s) => /listing_approvals/.test(s))

beforeEach(() => {
  sqls.length = 0
  approval.row = null
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('gateListingLive: VACANT is a public status (MKT-2)', () => {
  it('a. agency VACANT save with no approval -> DRAFT and a pending approval', async () => {
    const { gateListingLive } = await import('./listingApprovals.js')
    const out = await gateListingLive({ ...base, statusKey: 'VACANT', actorRole: 'agent_admin' })
    expect({ out, pending: pendingInsert() }).toEqual({ out: 'DRAFT', pending: true })
  })
  it('b. agency PUBLISHED save -> DRAFT (unchanged)', async () => {
    const { gateListingLive } = await import('./listingApprovals.js')
    const out = await gateListingLive({ ...base, statusKey: 'PUBLISHED', actorRole: 'agent_admin' })
    expect({ out, pending: pendingInsert() }).toEqual({ out: 'DRAFT', pending: true })
  })
  it('c. super admin VACANT save -> VACANT with the approved upsert', async () => {
    const { gateListingLive } = await import('./listingApprovals.js')
    const out = await gateListingLive({ ...base, statusKey: 'VACANT', actorRole: 'super_admin', actorIsOwner: true })
    expect({ out, approved: approvedUpsert() }).toEqual({ out: 'VACANT', approved: true })
  })
  it('d. already approved + agency VACANT save on a DRAFT -> DRAFT and pending again (P4: approved once is not approved forever)', async () => {
    approval.row = { status: 'approved' }
    const { gateListingLive } = await import('./listingApprovals.js')
    expect(await gateListingLive({ ...base, statusKey: 'VACANT', actorRole: 'agent_admin' })).toBe('DRAFT')
  })
  it('e. OCCUPIED / DRAFT pass through with no approval query', async () => {
    const { gateListingLive } = await import('./listingApprovals.js')
    const occ = await gateListingLive({ ...base, statusKey: 'OCCUPIED', actorRole: 'agent_admin' })
    const draft = await gateListingLive({ ...base, statusKey: 'DRAFT', actorRole: 'agent_admin' })
    expect({ occ, draft, queried: approvalLookup() }).toEqual({ occ: 'OCCUPIED', draft: 'DRAFT', queried: false })
  })
})

describe('one public-status set', () => {
  it('f. isPublicUnitStatus accepts VACANT in any case', async () => {
    const { isPublicUnitStatus } = await import('./listingTitleTypeConfirm.js')
    expect([isPublicUnitStatus('VACANT'), isPublicUnitStatus('vacant')]).toEqual([true, true])
  })
  it('g. server set has exactly the members of the client set', async () => {
    const server = await import('./publicUnitStatus.js')
    const client = await import('../src/lib/publicListings.js')
    expect([...server.PUBLIC_UNIT_STATUS_KEYS].sort()).toEqual([...client.PUBLIC_UNIT_STATUS_KEYS].sort())
  })
})

describe('status keys are trimmed and upper-cased (C2)', () => {
  it('a. normalizeStatusKey', async () => {
    const mod = (await import('./publicUnitStatus.js')) as { normalizeStatusKey?: (v: unknown) => string }
    expect(typeof mod.normalizeStatusKey, 'normalizeStatusKey exported').toBe('function')
    expect([' VACANT', 'vacant ', ' Published ', '   ', null, 42].map((v) => mod.normalizeStatusKey!(v))).toEqual(['VACANT', 'VACANT', 'PUBLISHED', '', '', ''])
  })
})
