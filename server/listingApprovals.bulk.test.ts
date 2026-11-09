import { beforeEach, describe, expect, it, vi } from 'vitest'

/** B1 u2-u4: approval readiness, bulk body validation, idempotent re-approve. */
const sqls: string[] = []
const state = { approval: 'pending' as string | null, unitStatus: 'DRAFT', images: ['/api/files/a.jpg'] as unknown[] }
vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(async (sql: string) => {
    sqls.push(sql)
    if (/FROM units u LEFT JOIN listing_approvals a/.test(sql)) {
      return [{ approval: state.approval, unit_status: state.unitStatus, client_id: 'c', title: 'T', requested_by: null, note: null }]
    }
    if (/FROM units u LEFT JOIN buildings b/.test(sql)) {
      return [{ title: 'T', images: state.images, formatted_address: '1 Main', rent: '9000', price: null, b_address: null, b_suburb: null }]
    }
    return []
  }),
  withTransaction: vi.fn(async (fn: () => unknown) => fn()),
  clientQuery: vi.fn(),
}))
vi.mock('./entityMap.js', () => ({ resolveUuid: vi.fn(async () => null) }))
vi.mock('./requestActor.js', () => ({ resolveRequestActor: vi.fn(async () => null) }))
vi.mock('./listingTitleTypeConfirm.js', () => ({ assertUnitTitleTypeConfirmed: vi.fn(async () => undefined) }))

const { applyListingApproval, parseBulkBody } = await import('./listingApprovals.js')
const U = '0f000000-0000-4000-8000-0000000000a1'
const uuid = (i: number) => `0f000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const settle = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e)
const rowSql = () => sqls.filter((s) => /UPDATE listing_approvals|UPDATE units|INSERT INTO notifications|INSERT INTO event_log/.test(s))

beforeEach(() => {
  sqls.length = 0
  state.approval = 'pending'
  state.unitStatus = 'DRAFT'
  state.images = ['/api/files/a.jpg']
})

describe('applyListingApproval (B1)', () => {
  it('u2. approving a not-ready unit is 422 LISTING_NOT_READY and the approval row is not touched', async () => {
    state.images = []
    const e = await settle(applyListingApproval({ unitId: U, decision: 'approved', note: '', reviewerUserId: null }))
    expect({ e, touched: sqls.some((s) => /UPDATE listing_approvals/.test(s)) }).toMatchObject({ e: { status: 422, code: 'LISTING_NOT_READY' }, touched: false })
  })
  it('u4. re-approving a live, approved listing is skipped: no update, no notification, no audit', async () => {
    state.approval = 'approved'
    state.unitStatus = 'PUBLISHED'
    const r = await applyListingApproval({ unitId: U, decision: 'approved', note: '', reviewerUserId: null })
    expect({ skipped: r.skipped, writes: rowSql() }).toEqual({ skipped: 'already_live', writes: [] })
  })
})

describe('bulk body validation (B1 u3)', () => {
  const bad = (body: Record<string, unknown>) => settle(parseBulkBody(body))
  it('101 distinct ids is a 400 and nothing runs', async () => {
    const e = await bad({ action: 'approve', unitIds: Array.from({ length: 101 }, (_, i) => uuid(i)) })
    expect({ e, sql: sqls.length }).toMatchObject({ e: { status: 400, message: 'At most 100 listings per request' }, sql: 0 })
  })
  it('a bad id, both unitIds and agencyId, or a decline without a note is a 400', async () => {
    const out = [
      await bad({ action: 'approve', unitIds: [uuid(1), 'nope'] }),
      await bad({ action: 'approve', unitIds: [uuid(1)], agencyId: 'ag-1' }),
      await bad({ action: 'decline', unitIds: [uuid(1)] }),
      await bad({ action: 'withdraw', agencyId: 'ag-1' }),
    ].map((e) => (e as { status?: number } | null)?.status)
    expect(out).toEqual([400, 400, 400, 400])
  })
  it('100 ids (after dedupe) is fine', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => uuid(i))
    const out = await parseBulkBody({ action: 'approve', unitIds: [...ids, ids[0]] })
    expect(out.unitIds).toHaveLength(100)
  })
})
