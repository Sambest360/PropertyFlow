import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { filterBootstrapForActor } from './scopeGate'
import { actorRequiredError, demoActorHeadersAllowed, SIGN_IN_REQUIRED_MESSAGE } from './actor'
import { buildPropertyScope } from '../src/lib/scope'
import { buildOwnerStatementBook } from '../src/lib/ownerStatement/buildOwnerStatementBook'
import type { DemoActor } from './actor'

const LL_UUID = '11111111-2222-4333-8444-555555555555'
const at = '2026-09-15T10:00:00.000Z'

function payload() {
  return {
    source: 'test',
    fetchedAt: at,
    agencies: [{ id: 'ag-a', status: 'Active', name: 'Agency A' }],
    users: [{ id: 'u-ll-a', role: 'landlord', name: 'Lana' }],
    buildings: [],
    units: [],
    properties: [
      { id: 'p-own', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll-a', title: 'Own' },
      { id: 'p-other', agencyId: 'ag-a', agentId: 'u-james', landlordId: 'u-ll-b', title: 'Other' },
    ],
    leads: [],
    applications: [],
    tenancies: [
      { id: 'ten-own', agencyId: 'ag-a', propertyId: 'p-own', landlordId: 'u-ll-a', tenantUserId: 'u-t1' },
      { id: 'ten-other', agencyId: 'ag-a', propertyId: 'p-other', landlordId: 'u-ll-b', tenantUserId: 'u-t2' },
    ],
    viewings: [],
    viewingSlots: [],
    payments: [],
    propertyDocuments: [],
    tickets: [],
    threads: [],
    messages: [],
    notifications: [],
    suiteAlerts: [
      { id: 'sa-null', agencyId: null },
      { id: 'sa-a', agencyId: 'ag-a' },
      { id: 'sa-b', agencyId: 'ag-b' },
    ],
    trustTransactions: [{ id: 'tx1', agencyId: 'ag-a' }],
    trustAllocations: [
      { id: 'al-own', agencyId: 'ag-a', occupancyId: 'ten-own', bucketCode: 'rent', amountCents: 900000, allocatedAt: at, trustTransactionId: 'tx1', chargeId: null, allocatedBy: 'u-james' },
      { id: 'al-other', agencyId: 'ag-a', occupancyId: 'ten-other', bucketCode: 'rent', amountCents: 500000, allocatedAt: at, trustTransactionId: 'tx1', chargeId: null, allocatedBy: 'u-james' },
    ],
    payoutInstructions: [
      { id: 'po-own', agencyId: 'ag-a', propertyId: 'p-own', payeeType: 'landlord', payeeId: 'u-ll-a', status: 'approved', amountCents: 800000, bucketCode: 'owner_payable', createdAt: at, updatedAt: at, submittedAt: null },
      { id: 'po-uuid', agencyId: 'ag-a', propertyId: 'p-own', payeeType: 'landlord', payeeId: LL_UUID, status: 'proposed', amountCents: 1000, bucketCode: 'owner_payable', createdAt: at, updatedAt: at, submittedAt: null },
      { id: 'po-vendor', agencyId: 'ag-a', propertyId: 'p-own', payeeType: 'vendor', payeeId: 'u-ll-a', status: 'approved', amountCents: 1, bucketCode: 'owner_payable', createdAt: at, updatedAt: at, submittedAt: null },
      { id: 'po-other-prop', agencyId: 'ag-a', propertyId: 'p-other', payeeType: 'landlord', payeeId: 'u-ll-a', status: 'approved', amountCents: 1, bucketCode: 'owner_payable', createdAt: at, updatedAt: at, submittedAt: null },
      { id: 'po-other-ll', agencyId: 'ag-a', propertyId: 'p-other', payeeType: 'landlord', payeeId: 'u-ll-b', status: 'approved', amountCents: 1, bucketCode: 'owner_payable', createdAt: at, updatedAt: at, submittedAt: null },
    ],
    depositHoldings: [{ id: 'dep1', agencyId: 'ag-a' }],
    arrearsSnapshots: [{ id: 'ar1', agencyId: 'ag-a' }],
    csvImportBatches: [{ id: 'csv1', agencyId: 'ag-a' }],
  }
}

function landlordView(userId: string, aliases?: ReadonlySet<string>) {
  const raw = payload()
  const actor: DemoActor = { userId, role: 'landlord', agencyId: 'ag-a' }
  const scope = buildPropertyScope(
    { role: 'landlord', userId: 'u-ll-a', agencyId: 'ag-a', agencySuspended: false },
    { properties: raw.properties },
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return filterBootstrapForActor(raw as any, actor, scope, aliases)
}

describe('landlord trust rows on bootstrap', () => {
  it('landlord gets allocations on own tenancies and own payee payouts on own properties only', () => {
    const out = landlordView('u-ll-a')
    expect((out.trustAllocations ?? []).map((a) => (a as { id: string }).id)).toEqual(['al-own'])
    expect((out.payoutInstructions ?? []).map((p) => (p as { id: string }).id)).toEqual(['po-own'])
  })

  it('landlord never gets trust transactions, deposits, arrears or CSV batches', () => {
    const out = landlordView('u-ll-a')
    expect(out.trustTransactions).toEqual([])
    expect(out.depositHoldings).toEqual([])
    expect(out.arrearsSnapshots).toEqual([])
    expect(out.csvImportBatches).toEqual([])
  })

  it('matches both uuid and front-end id forms of the landlord', () => {
    const aliases = new Set([LL_UUID, 'u-ll-a'])
    const fromUuid = landlordView(LL_UUID, aliases)
    expect((fromUuid.payoutInstructions ?? []).map((p) => (p as { id: string }).id).sort()).toEqual([
      'po-own',
      'po-uuid',
    ])
    expect((fromUuid.trustAllocations ?? []).map((a) => (a as { id: string }).id)).toEqual(['al-own'])
  })

  it('owner statement gets trust and payout figures from the landlord bootstrap', () => {
    const out = landlordView('u-ll-a')
    const book = buildOwnerStatementBook({
      landlordUserId: 'u-ll-a',
      landlordName: 'Lana',
      agencyId: 'ag-a',
      agencyName: 'Agency A',
      period: { start: '2026-09-01', end: '2026-09-30' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      properties: out.properties as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tenancies: out.tenancies as any,
      payments: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trustAllocations: out.trustAllocations as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payoutInstructions: out.payoutInstructions as any,
    })
    expect(book.allocations.map((a) => a.amountZar)).toEqual([9000])
    expect(book.payouts.map((p) => p.amountZar)).toEqual([8000])
  })
})

describe('suite alerts: no null-agency pass-through', () => {
  it('agency admin does not get null-agency suite alerts', () => {
    const raw = payload()
    const actor: DemoActor = { userId: 'u-amelia', role: 'client_admin', agencyId: 'ag-a' }
    const scope = buildPropertyScope(
      { role: actor.role, userId: actor.userId, agencyId: 'ag-a', agencySuspended: false },
      { properties: raw.properties },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = filterBootstrapForActor(raw as any, actor, scope)
    expect((out.suiteAlerts ?? []).map((s) => (s as { id: string }).id)).toEqual(['sa-a'])
  })
})

describe('demo actor headers in production', () => {
  it('ALLOW_DEMO_ACTOR is ignored when VERCEL_ENV=production', () => {
    expect(demoActorHeadersAllowed({ ALLOW_DEMO_ACTOR: '1', VERCEL_ENV: 'production', VERCEL: '1' } as NodeJS.ProcessEnv)).toBe(false)
  })
  it('ALLOW_DEMO_ACTOR still opts in on preview', () => {
    expect(demoActorHeadersAllowed({ ALLOW_DEMO_ACTOR: '1', VERCEL_ENV: 'preview', VERCEL: '1' } as NodeJS.ProcessEnv)).toBe(true)
  })
})

describe('actor-required error text', () => {
  it('production says sign-in is required', () => {
    const err = actorRequiredError({ VERCEL_ENV: 'production', VERCEL: '1' } as NodeJS.ProcessEnv)
    expect(err.message).toBe(SIGN_IN_REQUIRED_MESSAGE)
    expect(err.message).not.toMatch(/X-User-Id/)
    expect(err.status).toBe(401)
  })
  it('local dev keeps the header hint', () => {
    expect(actorRequiredError({} as NodeJS.ProcessEnv).message).toMatch(/X-User-Id/)
  })
})

describe('SigniFlow recordTenancyLeaseSign ordering', () => {
  it('waits for the e-sign envelope save before asking for status', () => {
    const src = readFileSync(new URL('../src/context/AppStore.tsx', import.meta.url), 'utf8')
    const start = src.indexOf('recordTenancyLeaseSign: async')
    const body = src.slice(start, src.indexOf('assignRole:', start))
    const wait = body.indexOf('await eSignSave')
    const status = body.indexOf('recordLeaseSignature(')
    expect(wait).toBeGreaterThan(-1)
    expect(wait).toBeLessThan(status)
    const issue = src.slice(src.indexOf('const issueLeasePackageForTenancy'))
    expect(issue.slice(0, issue.indexOf('[patch, persistUpsert]'))).toMatch(/leaseESignSaves\.current\.set\(/)
  })
})
