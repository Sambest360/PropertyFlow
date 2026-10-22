import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  query: (...args: unknown[]) => query(...args),
}))

vi.mock('./entityMap.js', () => ({
  isUuid: (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  resolveUuid: async (_type: string, id: string) => id,
}))

import {
  capSuggestions,
  deductionForOutcome,
  inspectionReadable,
  itemPatchDecision,
  patchInspectionItem,
  prefillMoveOutItems,
  reminderNeeded,
  statusAfterSignatures,
  createInventory,
  INSPECTION_DEADLINES,
} from './inspectionInventory.js'

const CLIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const UNIT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AGENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TENANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const OTHER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const LEASE = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const INSPECTION = '11111111-1111-4111-8111-111111111111'
const ITEM = '22222222-2222-4222-8222-222222222222'

const agent = { userId: AGENT, role: 'ground_agent' as const, agencyId: CLIENT }

describe('inspection inventory rules', () => {
  beforeEach(() => query.mockReset())

  it('creates an inventory row for every template item', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM units')) return [{ client_id: CLIENT, agent_id: AGENT }]
      if (sql.includes('FROM inventory_templates')) return []
      if (sql.includes('INSERT INTO internal_assets')) return []
      throw new Error(sql)
    })
    const result = await createInventory(agent, UNIT, { propertyType: 'room' })
    const inserts = query.mock.calls.filter((call) => String(call[0]).includes('INSERT INTO internal_assets'))
    expect(inserts.length).toBe(result.items.length)
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items.every((item) => item.itemName.length > 0)).toBe(true)
  })

  it('both signatures, or an agent witness when the tenant declined, sign the inspection', () => {
    expect(statusAfterSignatures([{ role: 'AGENT' }, { role: 'TENANT' }])).toBe('SIGNED')
    expect(statusAfterSignatures([{ role: 'AGENT', tenantDeclined: true, witnessNote: 'E2E TEST witness' }])).toBe('SIGNED')
    expect(statusAfterSignatures([{ role: 'AGENT', tenantDeclined: true, witnessNote: '  ' }])).toBe('AWAITING_SIGNATURES')
    expect(statusAfterSignatures([{ role: 'TENANT' }])).toBe('AWAITING_SIGNATURES')
  })

  it('prefills every move-in item and only MISSING or DAMAGED suggest a deduction', () => {
    const source = [
      { itemName: 'Bed' },
      { itemName: 'Stove' },
    ]
    expect(prefillMoveOutItems(source)).toEqual(source)
    expect(deductionForOutcome({ outcome: 'MISSING', amountCents: 150000, description: 'Bed', itemId: ITEM, deemedGoodOrder: false }).line?.outcome).toBe('MISSING')
    expect(deductionForOutcome({ outcome: 'DAMAGED', amountCents: 5000, description: 'Stove', itemId: ITEM, deemedGoodOrder: false }).line).not.toBeNull()
    expect(deductionForOutcome({ outcome: 'WEAR_AND_TEAR', amountCents: 5000, description: 'Paint', itemId: ITEM, deemedGoodOrder: false }).line).toBeNull()
    expect(deductionForOutcome({ outcome: 'OK', amountCents: 5000, description: 'Bed', itemId: ITEM, deemedGoodOrder: false }).line).toBeNull()
  })

  it('caps suggestions above the deposit plus interest and reports the remainder', () => {
    const capped = capSuggestions(
      [
        { amountCents: 800_00 },
        { amountCents: 500_00 },
      ],
      1000_00,
    )
    expect(capped.capped).toBe(true)
    expect(capped.warning).toMatch(/capped/i)
    expect(capped.totalCents).toBe(1000_00)
    expect(capped.remainderCents).toBe(0)
    expect(capped.lines[0].amountCents).toBe(800_00)
    expect(capped.lines[1].amountCents).toBe(200_00)
  })

  it('hides an inspection from a tenant of another unit', () => {
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

  it('rejects edits to a signed item and allows an agreed addendum', async () => {
    expect(itemPatchDecision({ status: 'SIGNED' })).toBe('locked')
    expect(itemPatchDecision({ status: 'SIGNED', addendum: true, tenantAgreed: true })).toBe('addendum')
    expect(itemPatchDecision({ status: 'DRAFT' })).toBe('update')
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM inspections WHERE id')) {
        return [{
          id: INSPECTION,
          client_id: CLIENT,
          unit_id: UNIT,
          lease_id: LEASE,
          type: 'MOVE_IN',
          status: 'SIGNED',
          baseline_inspection_id: null,
          pdf_document_id: null,
          dispute_note: null,
          tenant_attended: true,
        }]
      }
      throw new Error(sql)
    })
    await expect(patchInspectionItem(agent, INSPECTION, ITEM, { condition: 'DAMAGED' })).rejects.toMatchObject({
      status: 409,
      code: 'INSPECTION_LOCKED',
    })
  })

  it('blocks suggestions when there is no signed move-in', () => {
    const blocked = deductionForOutcome({
      outcome: 'MISSING',
      amountCents: 100,
      description: 'Bed',
      itemId: ITEM,
      deemedGoodOrder: true,
    })
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
    expect(reminderNeeded({
      today: '2026-10-01',
      startDate: '2026-10-05',
      endDate: '2027-10-01',
      signedMoveIn: false,
      moveOutScheduled: false,
    })).toEqual(['move_in'])
    expect(reminderNeeded({
      today: '2026-10-20',
      startDate: '2026-01-01',
      endDate: '2026-10-22',
      signedMoveIn: true,
      moveOutScheduled: false,
    })).toEqual(['move_out'])
    expect(reminderNeeded({
      today: '2026-10-01',
      startDate: '2026-11-01',
      endDate: '2027-10-01',
      signedMoveIn: false,
      moveOutScheduled: true,
    })).toEqual([])
  })
})
