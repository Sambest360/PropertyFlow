import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  query: (...args: unknown[]) => query(...args),
}))

vi.mock('./entityMap.js', () => ({
  isUuid: (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  resolveUuid: async (_type: string, id: string) => id,
  resolveFrontendId: async (_type: string, id: string) => `fe-${id.slice(-4)}`,
}))

// Agency ids are compared in the FE id space; the fixtures already use one space.
vi.mock('./scopeGate.js', () => ({
  agencyFeId: async (id: string | null) => id ?? null,
}))

import {
  CAP_WARNING,
  DEEMED_GOOD_ORDER_WARNING,
  INSPECTION_DEADLINES,
  addInspectionItem,
  addInspectionPhoto,
  capSuggestions,
  compareInspection,
  createInventory,
  dataUrlInfo,
  decideDeductions,
  deductionForOutcome,
  getInspection,
  inspectionPatchFields,
  inspectionReadable,
  itemPatchDecision,
  pairRows,
  patchInspection,
  patchInspectionItem,
  photoError,
  prefillMoveOutItems,
  readInspectionFile,
  reminderNeeded,
  signInspection,
  statusAfterSignatures,
  toneForOutcome,
} from './inspectionInventory.js'

const CLIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_CLIENT = 'abababab-abab-4bab-8bab-abababababab'
const UNIT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AGENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TENANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const OTHER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const LANDLORD = '99999999-9999-4999-8999-999999999999'
const LEASE = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const INSPECTION = '11111111-1111-4111-8111-111111111111'
const MOVE_IN = '33333333-3333-4333-8333-333333333333'
const ITEM = '22222222-2222-4222-8222-222222222222'
const DEPOSIT = '44444444-4444-4444-8444-444444444444'
const DOC = '55555555-5555-4555-8555-555555555555'
const D1 = '66666666-6666-4666-8666-666666666661'
const D2 = '66666666-6666-4666-8666-666666666662'

const agent = { userId: AGENT, role: 'ground_agent' as const, agencyId: CLIENT }
const admin = { userId: OTHER, role: 'client_admin' as const, agencyId: CLIENT }
const tenant = { userId: TENANT, role: 'tenant' as const, agencyId: null }
const otherTenant = { userId: OTHER, role: 'tenant' as const, agencyId: CLIENT }
const landlord = { userId: LANDLORD, role: 'landlord' as const, agencyId: null }
const outsider = { userId: AGENT, role: 'client_admin' as const, agencyId: OTHER_CLIENT }

const JPEG = `data:image/jpeg;base64,${Buffer.alloc(3000, 1).toString('base64')}`

type Row = Record<string, unknown>
type Fake = {
  inspection?: Partial<Row>
  lease?: Partial<Row>
  items?: Row[]
  signedMoveIn?: string | null
  deposit?: Row | null
  signatures?: Row[]
  suggestions?: Row[]
  openDeductions?: Row[]
  approvedTotal?: number
  updateReturns?: Row[]
  document?: Row | null
  signedForUnit?: string | null
}

function inspectionRow(over: Partial<Row> = {}): Row {
  return {
    id: INSPECTION,
    client_id: CLIENT,
    unit_id: UNIT,
    lease_id: LEASE,
    type: 'MOVE_OUT',
    status: 'DRAFT',
    baseline_inspection_id: MOVE_IN,
    pdf_document_id: null,
    dispute_note: null,
    tenant_attended: true,
    ...over,
  }
}

function leaseRow(over: Partial<Row> = {}): Row {
  return {
    id: LEASE,
    client_id: CLIENT,
    unit_id: UNIT,
    tenant_id: TENANT,
    landlord_id: LANDLORD,
    agent_id: AGENT,
    deposit_amount: 1000,
    unit_agent_id: AGENT,
    ...over,
  }
}

function itemRow(over: Partial<Row> = {}): Row {
  return {
    id: ITEM,
    inspection_id: INSPECTION,
    asset_id: null,
    room_id: null,
    item_name: 'Stove',
    quantity: 1,
    condition: 'GOOD',
    outcome: null,
    notes: null,
    photos: [],
    tenant_comment: null,
    addendum: false,
    purchase_value: 500,
    ...over,
  }
}

/** Routes each SQL statement to fixture rows; unknown SQL throws so tests see every query. */
function fakeDb(f: Fake = {}) {
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM inspections WHERE id')) return [inspectionRow(f.inspection)]
    if (sql.includes('FROM leases l') && sql.includes('JOIN units u')) return [leaseRow(f.lease)]
    if (sql.includes("type = 'MOVE_IN' AND status = 'SIGNED'")) {
      const id = f.signedMoveIn === undefined ? MOVE_IN : f.signedMoveIn
      return id ? [{ id }] : []
    }
    if (sql.includes('JOIN leases l ON l.id = i.lease_id')) return f.signedForUnit ? [{ id: f.signedForUnit }] : []
    if (sql.includes('FROM inspection_items i')) {
      if (params[0] === MOVE_IN) return [itemRow({ id: 'in-1', inspection_id: MOVE_IN, condition: 'EXCELLENT' })]
      return f.items ?? [itemRow()]
    }
    if (sql.includes('FROM inspection_signatures')) return f.signatures ?? []
    if (sql.includes('FROM deposit_holdings')) return f.deposit ? [f.deposit] : []
    if (sql.includes('FROM deposit_deductions d')) return f.openDeductions ?? []
    if (sql.includes('SUM(amount_cents)')) return [{ total: f.approvedTotal ?? 0 }]
    if (sql.includes("FROM deposit_deductions WHERE lease_id = $1::uuid AND status <> 'REJECTED'")) return f.suggestions ?? []
    if (sql.includes("status = 'APPROVED' AND amount_cents > 0")) return f.suggestions ?? []
    if (sql.includes('FROM documents WHERE id')) return f.document ? [f.document] : []
    if (sql.includes('FROM units WHERE id')) return [{ client_id: CLIENT, agent_id: AGENT }]
    if (sql.includes('FROM inventory_templates')) return []
    if (sql.includes('RETURNING id')) return f.updateReturns ?? [{ id: INSPECTION }]
    if (/^\s*(INSERT|UPDATE|DELETE)/.test(sql)) return []
    throw new Error(`unexpected SQL: ${sql}`)
  })
}

const calls = (needle: string) => query.mock.calls.filter((call) => String(call[0]).includes(needle))

describe('inspection inventory rules', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('creates an inventory row for every template item', async () => {
    fakeDb()
    const result = await createInventory(agent, UNIT, { propertyType: 'room' })
    const inserts = calls('INSERT INTO internal_assets')
    expect(inserts.length).toBe(result.items.length)
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items.every((item) => item.itemName.length > 0)).toBe(true)
    expect(result.addendumInspectionId).toBeNull()
  })

  it('both signatures, or an agent witness when the tenant declined, sign the inspection', () => {
    expect(statusAfterSignatures([{ role: 'AGENT' }, { role: 'TENANT' }])).toBe('SIGNED')
    expect(statusAfterSignatures([{ role: 'AGENT', tenantDeclined: true, witnessNote: 'E2E TEST witness' }])).toBe('SIGNED')
    expect(statusAfterSignatures([{ role: 'AGENT', tenantDeclined: true, witnessNote: '  ' }])).toBe('AWAITING_SIGNATURES')
    expect(statusAfterSignatures([{ role: 'TENANT' }])).toBe('AWAITING_SIGNATURES')
  })

  it('prefills every move-in item and only MISSING or DAMAGED suggest a deduction', () => {
    const source = [{ itemName: 'Bed' }, { itemName: 'Stove' }]
    expect(prefillMoveOutItems(source)).toEqual(source)
    expect(deductionForOutcome({ outcome: 'MISSING', amountCents: 150000, description: 'Bed', itemId: ITEM, deemedGoodOrder: false }).line?.outcome).toBe('MISSING')
    expect(deductionForOutcome({ outcome: 'DAMAGED', amountCents: 5000, description: 'Stove', itemId: ITEM, deemedGoodOrder: false }).line).not.toBeNull()
    expect(deductionForOutcome({ outcome: 'WEAR_AND_TEAR', amountCents: 5000, description: 'Paint', itemId: ITEM, deemedGoodOrder: false }).line).toBeNull()
    expect(deductionForOutcome({ outcome: 'OK', amountCents: 5000, description: 'Bed', itemId: ITEM, deemedGoodOrder: false }).line).toBeNull()
  })

  it('caps suggestions above the deposit plus interest and reports the remainder', () => {
    const capped = capSuggestions([{ amountCents: 800_00 }, { amountCents: 500_00 }], 1000_00)
    expect(capped.capped).toBe(true)
    expect(capped.warning).toBe(CAP_WARNING)
    expect(capped.totalCents).toBe(1000_00)
    expect(capped.remainderCents).toBe(0)
    expect(capped.lines[0].amountCents).toBe(800_00)
    expect(capped.lines[1].amountCents).toBe(200_00)
  })

  it('hides an inspection from a tenant of another unit (pure rule)', () => {
    expect(inspectionReadable({
      actorRole: 'tenant',
      actorUserId: OTHER,
      actorClientId: CLIENT,
      leaseClientId: CLIENT,
      tenantId: TENANT,
      landlordId: null,
    })).toBe(false)
    expect(inspectionReadable({
      actorRole: 'tenant',
      actorUserId: TENANT,
      actorClientId: null,
      leaseClientId: CLIENT,
      tenantId: TENANT,
      landlordId: null,
    })).toBe(true)
  })

  it('rejects edits to a signed item and allows an addendum', async () => {
    expect(itemPatchDecision({ status: 'SIGNED' })).toBe('locked')
    expect(itemPatchDecision({ status: 'SIGNED', addendum: true, tenantAgreed: true })).toBe('addendum')
    expect(itemPatchDecision({ status: 'DRAFT' })).toBe('update')
    fakeDb({ inspection: { type: 'MOVE_IN', status: 'SIGNED', baseline_inspection_id: null } })
    await expect(patchInspectionItem(agent, INSPECTION, ITEM, { condition: 'DAMAGED' })).rejects.toMatchObject({
      status: 409,
      code: 'INSPECTION_LOCKED',
    })
    expect(calls('UPDATE inspection_items')).toHaveLength(0)
  })

  it('blocks suggestions when there is no signed move-in', () => {
    const blocked = deductionForOutcome({ outcome: 'MISSING', amountCents: 100, description: 'Bed', itemId: ITEM, deemedGoodOrder: true })
    expect(blocked.blocked).toBe(true)
    expect(blocked.line).toBeNull()
  })

  it('states the three deadline windows and that a lawyer must confirm them', () => {
    expect(INSPECTION_DEADLINES.lawyerConfirmationRequired).toBe(true)
    expect(INSPECTION_DEADLINES.noDeductionsRefundDays).toBe(7)
    expect(INSPECTION_DEADLINES.deductionsBalanceDays).toBe(14)
    expect(INSPECTION_DEADLINES.tenantAbsentInspectDays).toBe(7)
    expect(INSPECTION_DEADLINES.tenantAbsentRefundDays).toBe(21)
  })

  it('reminds for a move-in before the start and a move-out inside three days', () => {
    expect(reminderNeeded({ today: '2026-10-01', startDate: '2026-10-05', endDate: '2027-10-01', signedMoveIn: false, moveOutScheduled: false })).toEqual(['move_in'])
    expect(reminderNeeded({ today: '2026-10-20', startDate: '2026-01-01', endDate: '2026-10-22', signedMoveIn: true, moveOutScheduled: false })).toEqual(['move_out'])
    expect(reminderNeeded({ today: '2026-10-01', startDate: '2026-11-01', endDate: '2027-10-01', signedMoveIn: false, moveOutScheduled: true })).toEqual([])
  })

  it('tones: red missing, amber damaged, grey wear and tear', () => {
    expect(toneForOutcome('MISSING')).toBe('red')
    expect(toneForOutcome('DAMAGED')).toBe('amber')
    expect(toneForOutcome('WEAR_AND_TEAR')).toBe('grey')
    expect(toneForOutcome(null)).toBe('neutral')
  })

  it('pairs move-out rows to the move-in row by asset, then by name', () => {
    const moveIn = [
      { id: 'a', asset_id: 'x', item_name: 'Old name' },
      { id: 'b', asset_id: null, item_name: 'Bed' },
    ]
    const moveOut = [
      { id: 'c', asset_id: 'x', item_name: 'Stove' },
      { id: 'd', asset_id: null, item_name: 'Bed' },
      { id: 'e', asset_id: null, item_name: 'New lamp' },
    ]
    expect(pairRows(moveIn, moveOut).map((p) => p.moveIn?.id ?? null)).toEqual(['a', 'b', null])
  })
})

describe('wear and tear is never deducted', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('saving WEAR_AND_TEAR clears the open suggestion and never inserts one', async () => {
    fakeDb()
    const result = await patchInspectionItem(agent, INSPECTION, ITEM, { outcome: 'WEAR_AND_TEAR', amountCents: 50_000 })
    expect(result.deduction).toBeNull()
    expect(calls('INSERT INTO deposit_deductions')).toHaveLength(0)
    expect(calls("DELETE FROM deposit_deductions WHERE inspection_item_id")).toHaveLength(1)
  })

  it('a DAMAGED move-out item suggests a deduction from the asset value', async () => {
    fakeDb()
    const result = await patchInspectionItem(agent, INSPECTION, ITEM, { outcome: 'DAMAGED' })
    expect(result.deduction).toMatchObject({ amountCents: 500_00, outcome: 'DAMAGED' })
    expect(calls('INSERT INTO deposit_deductions')).toHaveLength(1)
  })

  it('approval rejects a stale suggestion on a wear-and-tear item', async () => {
    fakeDb({
      openDeductions: [
        { id: D1, amount_cents: 300_00, outcome: 'DAMAGED' },
        { id: D2, amount_cents: 200_00, outcome: 'WEAR_AND_TEAR' },
      ],
    })
    await decideDeductions(admin, LEASE, { ids: [D1, D2], status: 'APPROVED' })
    const approved = calls("SET status = 'APPROVED'").map((c) => (c[1] as unknown[])[1])
    expect(approved).toEqual([D1])
    const rejected = calls("SET status = 'REJECTED'")
    expect(rejected).toHaveLength(1)
    expect((rejected[0][1] as unknown[])[1]).toEqual([D2])
  })

  it('the comparison shows a wear-and-tear row at R0', async () => {
    fakeDb({
      items: [itemRow({ outcome: 'WEAR_AND_TEAR' })],
      suggestions: [{ id: D1, inspection_item_id: ITEM, description: 'Stove', amount_cents: 100_00, status: 'SUGGESTED' }],
    })
    const body = await compareInspection(agent, INSPECTION)
    expect(body.rows[0]).toMatchObject({ tone: 'grey', amountCents: 0 })
  })
})

describe('suggestions are capped at deposit + interest', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('compare caps against the trust holding (held + interest) and warns', async () => {
    fakeDb({
      deposit: { id: DEPOSIT, status: 'held', held_cents: 900_00, interest_accrued_cents: 100_00 },
      items: [itemRow({ outcome: 'MISSING' })],
      suggestions: [
        { id: D1, inspection_item_id: ITEM, description: 'Stove MISSING', amount_cents: 800_00, status: 'SUGGESTED' },
        { id: D2, inspection_item_id: null, description: 'Door DAMAGED', amount_cents: 500_00, status: 'SUGGESTED' },
      ],
    })
    const body = await compareInspection(agent, INSPECTION)
    expect(body.capCents).toBe(1000_00)
    expect(body.totalCents).toBe(1000_00)
    expect(body.capped).toBe(true)
    expect(body.warning).toBe(CAP_WARNING)
    expect(body.rows[0]).toMatchObject({ tone: 'red', amountCents: 800_00, moveInCondition: 'EXCELLENT' })
  })

  it('approval caps what is left after earlier approvals and writes the capped amount', async () => {
    fakeDb({
      deposit: { id: DEPOSIT, status: 'held', held_cents: 1000_00, interest_accrued_cents: 0 },
      approvedTotal: 700_00,
      openDeductions: [{ id: D1, amount_cents: 500_00, outcome: 'MISSING' }],
    })
    const result = await decideDeductions(landlord, LEASE, { ids: [D1], status: 'APPROVED' })
    expect(result.warning).toBe(CAP_WARNING)
    const update = calls("SET status = 'APPROVED'")[0][1] as unknown[]
    expect(update).toEqual([LEASE, D1, 300_00])
  })
})

describe('no signed move-in: no suggestions, with a warning', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('records the outcome but suggests nothing and returns the warning', async () => {
    fakeDb({ inspection: { baseline_inspection_id: null }, signedMoveIn: null })
    const result = await patchInspectionItem(agent, INSPECTION, ITEM, { outcome: 'MISSING' })
    expect(result.deduction).toBeNull()
    expect(result.warning).toBe(DEEMED_GOOD_ORDER_WARNING)
    expect(calls('UPDATE inspection_items')).toHaveLength(1)
    expect(calls('INSERT INTO deposit_deductions')).toHaveLength(0)
  })

  it('compare returns no suggestions, R0 deductions and the full deposit as refund', async () => {
    fakeDb({
      inspection: { baseline_inspection_id: null },
      signedMoveIn: null,
      suggestions: [{ id: D1, inspection_item_id: ITEM, description: 'Stove', amount_cents: 100_00, status: 'SUGGESTED' }],
    })
    const body = await compareInspection(agent, INSPECTION)
    expect(body.deemedGoodOrder).toBe(true)
    expect(body.warning).toBe(DEEMED_GOOD_ORDER_WARNING)
    expect(body.suggestions).toEqual([])
    expect(body.totalCents).toBe(0)
    expect(body.remainderCents).toBe(1000_00)
  })

  it('approving deductions is refused', async () => {
    fakeDb({ signedMoveIn: null })
    await expect(decideDeductions(admin, LEASE, { ids: [D1], status: 'APPROVED' })).rejects.toMatchObject({
      status: 409,
      code: 'DEEMED_GOOD_ORDER',
    })
  })
})

describe('a signed inspection is read-only', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('PATCH /api/inspections/:id is refused once SIGNED', async () => {
    fakeDb({ inspection: { status: 'SIGNED' } })
    await expect(patchInspection(agent, INSPECTION, { scheduled_at: '2026-11-01T09:00:00Z' })).rejects.toMatchObject({
      status: 409,
      code: 'INSPECTION_LOCKED',
    })
    expect(calls('UPDATE inspections')).toHaveLength(0)
  })

  it('PATCH loses to a signature that lands first (conditional UPDATE)', async () => {
    fakeDb({ updateReturns: [] })
    await expect(patchInspection(agent, INSPECTION, { tenant_attended: false })).rejects.toMatchObject({ status: 409 })
    expect(String(calls('UPDATE inspections')[0][0])).toContain("status <> 'SIGNED'")
  })

  it('PATCH sets status, schedule, conducted time and attendance on a draft', async () => {
    fakeDb()
    const result = await patchInspection(agent, INSPECTION, {
      status: 'AWAITING_SIGNATURES',
      scheduled_at: '2026-11-01T09:00:00Z',
      conducted_at: null,
      tenant_attended: false,
    })
    expect(result).toMatchObject({ status: 'AWAITING_SIGNATURES', conductedAt: null, tenantAttended: false })
    const [sql, params] = calls('UPDATE inspections')[0] as [string, unknown[]]
    expect(sql).toContain('scheduled_at = $3::timestamptz')
    expect(params).toEqual([INSPECTION, 'AWAITING_SIGNATURES', '2026-11-01T09:00:00.000Z', null, false])
  })

  it('PATCH validates its fields and cannot set SIGNED', () => {
    expect(() => inspectionPatchFields({ status: 'SIGNED' })).toThrow(/signing sets SIGNED/)
    expect(() => inspectionPatchFields({ scheduled_at: 'soon' })).toThrow(/ISO date/)
    expect(() => inspectionPatchFields({ tenant_attended: 'yes' })).toThrow(/true or false/)
    expect(inspectionPatchFields({ tenantAttended: true })).toEqual({ tenantAttended: true })
  })

  it('PATCH is staff only', async () => {
    fakeDb()
    await expect(patchInspection(tenant, INSPECTION, { tenant_attended: false })).rejects.toMatchObject({ status: 403 })
  })

  it('photos cannot be added once SIGNED', async () => {
    fakeDb({ inspection: { status: 'SIGNED' } })
    await expect(addInspectionPhoto(agent, INSPECTION, ITEM, { dataUrl: JPEG })).rejects.toMatchObject({ status: 409 })
    expect(calls('INSERT INTO documents')).toHaveLength(0)
  })

  it('signing again is refused', async () => {
    fakeDb({ inspection: { status: 'SIGNED' } })
    await expect(signInspection(agent, INSPECTION, { role: 'AGENT' }, null)).rejects.toMatchObject({ status: 409 })
  })
})

describe('tenant refuses to sign', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('a refusal disputes the inspection', async () => {
    fakeDb({ inspection: { status: 'AWAITING_SIGNATURES' } })
    const result = await signInspection(tenant, INSPECTION, { role: 'TENANT', refused: true, comment: 'E2E TEST stove was fine' }, null)
    expect(result.status).toBe('DISPUTED')
    expect(calls("SET status = 'DISPUTED'")).toHaveLength(1)
    expect(calls('INSERT INTO inspection_signatures')).toHaveLength(0)
  })

  it('a refusal needs a comment', async () => {
    fakeDb()
    await expect(signInspection(tenant, INSPECTION, { role: 'TENANT', refused: true }, null)).rejects.toMatchObject({ status: 400 })
  })

  it('the agent signs "tenant declined" with a witness note and the inspection is SIGNED', async () => {
    fakeDb({
      inspection: { status: 'DISPUTED' },
      signatures: [{ role: 'AGENT', tenant_declined: true, witness_note: 'E2E TEST witness: caretaker present' }],
    })
    const result = await signInspection(agent, INSPECTION, { role: 'AGENT', tenantDeclined: true, witnessNote: 'E2E TEST witness: caretaker present' }, '127.0.0.1')
    expect(result.status).toBe('SIGNED')
    const params = calls('INSERT INTO inspection_signatures')[0][1] as unknown[]
    expect(params.slice(4)).toEqual(['AGENT', '127.0.0.1', 'IN_APP', 'E2E TEST witness: caretaker present', true])
  })

  it('"tenant declined" without a witness note is refused', async () => {
    fakeDb({ inspection: { status: 'DISPUTED' } })
    await expect(signInspection(agent, INSPECTION, { role: 'AGENT', tenantDeclined: true, witnessNote: ' ' }, null)).rejects.toMatchObject({
      code: 'WITNESS_REQUIRED',
    })
  })

  it('an ordinary agent signature keeps the dispute visible', async () => {
    fakeDb({ inspection: { status: 'DISPUTED' }, signatures: [{ role: 'AGENT', tenant_declined: false, witness_note: null }] })
    expect((await signInspection(agent, INSPECTION, { role: 'AGENT' }, null)).status).toBe('DISPUTED')
  })
})

describe('items added after move-in go into a dated addendum', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('adding an item to a signed inspection inserts it as an addendum stamped NOW()', async () => {
    fakeDb({ inspection: { type: 'MOVE_IN', status: 'SIGNED' } })
    const result = await addInspectionItem(agent, INSPECTION, { itemName: 'E2E TEST microwave', tenantAgreed: true })
    expect(result.addendum).toBe(true)
    const [sql, params] = calls('INSERT INTO inspection_items')[0] as [string, unknown[]]
    expect(sql).toContain('CASE WHEN $8::boolean THEN NOW() END')
    expect(params[7]).toBe(true)
    expect(calls('INSERT INTO event_log').some((c) => (c[1] as unknown[])[2] === 'inspection_addendum_added')).toBe(true)
  })

  it('a PATCH with addendum on a signed inspection adds a row instead of editing', async () => {
    fakeDb({ inspection: { type: 'MOVE_IN', status: 'SIGNED' } })
    const result = await patchInspectionItem(agent, INSPECTION, ITEM, { addendum: true, itemName: 'E2E TEST kettle' })
    expect(result).toMatchObject({ addendum: true })
    expect(calls('UPDATE inspection_items')).toHaveLength(0)
  })

  it('inventory added to a unit with a signed move-in lands on that inspection as an addendum', async () => {
    fakeDb({ signedForUnit: MOVE_IN })
    const result = await createInventory(agent, UNIT, { items: [{ room: 'Kitchen', name: 'E2E TEST fridge', quantity: 1 }] })
    expect(result.addendumInspectionId).toBe(MOVE_IN)
    const params = calls('INSERT INTO inspection_items')[0][1] as unknown[]
    expect(params[2]).toBe(MOVE_IN)
    expect(String(calls('INSERT INTO inspection_items')[0][0])).toContain('TRUE, NOW()')
  })

  it('an item added before signing is a normal row', async () => {
    fakeDb({ inspection: { type: 'MOVE_IN', status: 'DRAFT' } })
    expect((await addInspectionItem(agent, INSPECTION, { itemName: 'E2E TEST lamp' })).addendum).toBe(false)
  })
})

describe('a tenant of another unit cannot read the inspection (route check)', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('getInspection: 403 for another tenant, 200 for the lease tenant and landlord', async () => {
    fakeDb()
    await expect(getInspection(otherTenant, INSPECTION)).rejects.toMatchObject({ status: 403 })
    await expect(getInspection(tenant, INSPECTION)).resolves.toMatchObject({ inspection: { id: INSPECTION } })
    await expect(getInspection(landlord, INSPECTION)).resolves.toMatchObject({ readOnly: false })
  })

  it('compare and stored files: 403 for another tenant and for staff of another agency', async () => {
    fakeDb({ document: { lease_id: LEASE, unit_id: UNIT, storage_url: JPEG, mime_type: 'image/jpeg', name: 'stove.jpg' } })
    await expect(compareInspection(otherTenant, INSPECTION)).rejects.toMatchObject({ status: 403 })
    await expect(readInspectionFile(otherTenant, DOC)).rejects.toMatchObject({ status: 403 })
    await expect(readInspectionFile(outsider, DOC)).rejects.toMatchObject({ status: 403 })
    const file = await readInspectionFile(tenant, DOC)
    expect(file).toMatchObject({ kind: 'bytes', mimeType: 'image/jpeg' })
  })

  it('a tenant cannot sign as agent or touch another lease', async () => {
    fakeDb()
    await expect(signInspection(otherTenant, INSPECTION, { role: 'TENANT' }, null)).rejects.toMatchObject({ status: 403 })
    await expect(patchInspectionItem(otherTenant, INSPECTION, ITEM, { tenantComment: 'x' })).rejects.toMatchObject({ status: 403 })
  })

  it('migration 026 adds the same rule as RLS, including inspection files in documents', () => {
    const sql = readFileSync(new URL('../database/postgres/migrations/026_lease_inspections.sql', import.meta.url), 'utf8')
    expect(sql).toMatch(/l\.tenant_id = current_app_user_id\(\)/)
    expect(sql).toMatch(/CREATE POLICY inspections_select ON inspections[\s\S]*inspection_row_visible\(client_id, lease_id\)/)
    expect(sql).toMatch(/CREATE POLICY documents_inspection_files_scope ON documents\s+AS RESTRICTIVE/)
    expect(sql).toMatch(/ALTER TABLE documents ALTER COLUMN storage_url TYPE TEXT/)
  })
})

describe('photos go to documents with a timestamp and uploader', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('stores the photo as a documents row and keeps only the document id on the item', async () => {
    fakeDb()
    const result = await addInspectionPhoto(agent, INSPECTION, ITEM, { name: 'stove.jpg', dataUrl: JPEG })
    const [sql, params] = calls('INSERT INTO documents')[0] as [string, unknown[]]
    expect(sql).toContain("'INSPECTION'")
    expect(params[3]).toBe(LEASE)
    expect(params[4]).toBe(AGENT)
    expect(params[6]).toBe(JPEG)
    expect(params[9]).toBe('inspection-file:photo')
    expect(result.photo).toMatchObject({ uploadedBy: AGENT, uploaderRole: 'ground_agent', mimeType: 'image/jpeg' })
    expect(Date.parse(result.photo.uploadedAt)).not.toBeNaN()
    expect(result.photo.url).toBe(`/api/inspection-files/${result.photo.documentId}`)
    const appended = JSON.parse((calls('SET photos = COALESCE')[0][1] as unknown[])[1] as string)
    expect(appended[0]).not.toHaveProperty('dataUrl')
  })

  it('refuses non-images and photos over 2 MB after compression', async () => {
    expect(photoError('data:application/pdf;base64,AAAA')).toMatch(/JPEG or PNG/)
    const big = `data:image/jpeg;base64,${Buffer.alloc(2 * 1024 * 1024 + 10).toString('base64')}`
    expect(photoError(big)).toMatch(/2 MB/)
    expect(dataUrlInfo(JPEG)).toEqual({ mimeType: 'image/jpeg', bytes: 3000 })
    fakeDb()
    await expect(addInspectionPhoto(agent, INSPECTION, ITEM, { dataUrl: big })).rejects.toMatchObject({ code: 'PHOTO_INVALID' })
  })

  it('the lease tenant may add evidence photos', async () => {
    fakeDb()
    const result = await addInspectionPhoto(tenant, INSPECTION, ITEM, { dataUrl: JPEG })
    expect(result.photo.uploaderRole).toBe('tenant')
  })
})

describe('approved deductions go to the deposit release flow', () => {
  beforeEach(() => {
    query.mockReset()
  })

  it('writes deposit_deductions_approved on the holding and returns the next dual-control step', async () => {
    fakeDb({
      deposit: { id: DEPOSIT, status: 'held', held_cents: 1000_00, interest_accrued_cents: 50_00 },
      openDeductions: [{ id: D1, amount_cents: 300_00, outcome: 'MISSING' }],
      suggestions: [{ id: D1, description: 'Stove MISSING', amount_cents: 300_00, inspection_item_id: ITEM }],
    })
    const result = await decideDeductions(admin, LEASE, { ids: [D1], status: 'APPROVED' })
    expect(result.refundPrefill).toEqual([{ reason: 'Stove MISSING', amountCents: 300_00 }])
    expect(result.deposit).toEqual({ depositId: 'fe-4444', status: 'held', nextStep: 'propose-release' })
    const handoff = calls('INSERT INTO event_log').find((c) => (c[1] as unknown[])[2] === 'deposit_deductions_approved')!
    const params = handoff[1] as unknown[]
    expect(params[3]).toBe('deposit_holding')
    expect(params[4]).toBe(DEPOSIT)
    expect(JSON.parse(params[6] as string)).toMatchObject({ leaseId: LEASE, totalCents: 300_00, deductions: result.refundPrefill })
  })

  it('without a deposit holding it says so and writes no hand-off', async () => {
    fakeDb({ deposit: null, openDeductions: [{ id: D1, amount_cents: 100, outcome: 'DAMAGED' }] })
    const result = await decideDeductions(admin, LEASE, { ids: [D1], status: 'APPROVED' })
    expect(result.deposit).toBeNull()
    expect(result.depositWarning).toMatch(/deposit register/)
    expect(calls('INSERT INTO event_log').some((c) => (c[1] as unknown[])[2] === 'deposit_deductions_approved')).toBe(false)
  })

  it('only the landlord or an agency admin decides', async () => {
    fakeDb()
    await expect(decideDeductions(agent, LEASE, { ids: [D1], status: 'APPROVED' })).rejects.toMatchObject({ status: 403 })
    await expect(decideDeductions(tenant, LEASE, { ids: [D1], status: 'APPROVED' })).rejects.toMatchObject({ status: 403 })
    await expect(decideDeductions(outsider, LEASE, { ids: [D1], status: 'APPROVED' })).rejects.toMatchObject({ status: 403 })
  })
})

describe('routes are registered', () => {
  it('server/index.ts calls registerInspectionRoutes and the PATCH route exists', () => {
    const index = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    expect(index).toMatch(/^registerInspectionRoutes\(app\)$/m)
    const routes = readFileSync(new URL('./inspectionRoutes.ts', import.meta.url), 'utf8')
    expect(routes).toContain("app.patch('/api/inspections/:id',")
    expect(routes).toContain("app.get('/api/inspection-files/:documentId',")
  })
})
