import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertUnitErfSize,
  ensureUnitErfSizeColumn,
  readUnitErfSize,
  resetUnitErfSizeCache,
  unitErfSizeColumnExists,
  writeUnitErfSize,
} from './unitErfSize'

vi.mock('./db.js', () => ({ query: vi.fn(async () => []) }))

const UUID = '00000000-0000-4000-8000-0000000000e1'

function fakeDb(columnPresent: boolean | 'fail') {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  const q = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params })
    if (sql.includes('information_schema')) {
      if (columnPresent === 'fail') throw new Error('connection reset')
      return columnPresent ? [{ '?column?': 1 }] : []
    }
    return []
  })
  return { q, calls, updates: () => calls.filter((c) => c.sql.includes('UPDATE units SET erf_size_sqm')) }
}

async function write(d: Record<string, unknown>, q: ReturnType<typeof fakeDb>['q']) {
  await ensureUnitErfSizeColumn(q as never)
  return writeUnitErfSize(UUID, d, q as never)
}

beforeEach(() => resetUnitErfSizeCache())

describe('T2 erf_size_sqm write — column present (migration 037 applied)', () => {
  it('writes the erf size', async () => {
    const db = fakeDb(true)
    await write({ erfSizeSqm: 600 }, db.q)
    expect(db.updates()).toHaveLength(1)
    expect(db.updates()[0].params).toEqual([UUID, 600])
  })
  it('accepts a numeric string and 0', async () => {
    const db = fakeDb(true)
    await write({ erfSizeSqm: '812.5' }, db.q)
    await write({ erfSizeSqm: 0 }, db.q)
    expect(db.updates().map((u) => u.params?.[1])).toEqual([812.5, 0])
  })
  it('null / blank clears it (sectional title)', async () => {
    const db = fakeDb(true)
    await write({ erfSizeSqm: null }, db.q)
    await write({ erfSizeSqm: '' }, db.q)
    expect(db.updates().map((u) => u.params?.[1])).toEqual([null, null])
  })
  it('absent keeps the stored value (no write)', async () => {
    const db = fakeDb(true)
    await write({ area: 250 }, db.q)
    expect(db.updates()).toHaveLength(0)
  })
  it('never derives erf from the floor size', async () => {
    const db = fakeDb(true)
    await write({ area: 250, squareMeters: 250 }, db.q)
    expect(db.updates()).toHaveLength(0)
  })
})

describe('T2 erf_size_sqm write — column missing (037 not applied yet)', () => {
  it('is a no-op and does not throw', async () => {
    const db = fakeDb(false)
    await expect(write({ erfSizeSqm: 600 }, db.q)).resolves.toBeUndefined()
    expect(db.updates()).toHaveLength(0)
  })
  it('bootstrap flag reports unsupported', async () => {
    expect(await unitErfSizeColumnExists(fakeDb(false).q as never)).toBe(false)
  })
})

describe('T2 erf_size_sqm column check', () => {
  it('checks once and caches', async () => {
    const db = fakeDb(true)
    await ensureUnitErfSizeColumn(db.q as never)
    await ensureUnitErfSizeColumn(db.q as never)
    expect(db.calls.filter((c) => c.sql.includes('information_schema'))).toHaveLength(1)
    expect(db.calls[0].sql).toContain("table_name = 'units'")
    expect(db.calls[0].sql).toContain("column_name = 'erf_size_sqm'")
  })
  it('a failed check throws 503 and caches nothing; the bootstrap flag fails closed', async () => {
    await expect(ensureUnitErfSizeColumn(fakeDb('fail').q as never)).rejects.toMatchObject({
      status: 503,
      code: 'UNIT_ERF_SIZE_CHECK_FAILED',
    })
    expect(await unitErfSizeColumnExists(fakeDb('fail').q as never)).toBe(false)
    expect(await unitErfSizeColumnExists(fakeDb(true).q as never)).toBe(true)
  })
  it('refuses to write before the check ran (no silent drop)', async () => {
    const db = fakeDb(true)
    await expect(writeUnitErfSize(UUID, { erfSizeSqm: 600 }, db.q as never)).rejects.toMatchObject({
      code: 'UNIT_ERF_SIZE_CHECK_FAILED',
    })
  })
})

describe('T2 erf_size_sqm validation', () => {
  it('400 for a negative or non-numeric erf size', () => {
    expect(() => assertUnitErfSize({ erfSizeSqm: -1 })).toThrow(expect.objectContaining({ status: 400, code: 'UNIT_ERF_SIZE_INVALID' }))
    expect(() => assertUnitErfSize({ erfSizeSqm: 'big' })).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => assertUnitErfSize({ erfSizeSqm: 1e10 })).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => assertUnitErfSize({ erfSizeSqm: 600 })).not.toThrow()
    expect(() => assertUnitErfSize({ erfSizeSqm: null })).not.toThrow()
    expect(() => assertUnitErfSize({})).not.toThrow()
  })
})

describe('T2 erf_size_sqm bootstrap read', () => {
  it('maps the column, and is null when the column is absent (SELECT * before 037)', () => {
    expect(readUnitErfSize({ erf_size_sqm: '600.00' })).toBe(600)
    expect(readUnitErfSize({ erf_size_sqm: null })).toBeNull()
    expect(readUnitErfSize({ square_meters: '250.00' })).toBeNull()
  })
})
