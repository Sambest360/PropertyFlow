import { afterEach, describe, expect, it, vi } from 'vitest'

// R1: room layout values are clamped into the rooms CHECK range on save, and a
// CHECK violation (23514) on a persist write is a 400, not a 500. Mock setup
// copied from server/writes.leaseOverlap409.test.ts.

const query = vi.fn()

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(async (fn: () => unknown) => fn()),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

const AGENCY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const UNIT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const ROOM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => undefined),
  ensureUuid: vi.fn(async () => ROOM),
  resolveUuid: vi.fn(async (type: string) => {
    if (type === 'agency') return AGENCY
    if (type === 'property' || type === 'unit') return UNIT
    return null
  }),
  forgetId: vi.fn(async () => undefined),
  upsertEntityMapFrontendId: vi.fn(async (_et: string, _fe: string, uuid: string) => uuid),
  isUuid: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

const body = {
  resource: 'room' as const,
  action: 'upsert' as const,
  id: 'rm-1',
  data: { unitId: 'U-1', agencyId: 'AG-1', name: 'Bed 7', kind: 'bedroom', layout: { x: -5, y: 101, w: 42.456, h: '28' } },
}

function insertThrows(code: string) {
  return async (sql: string) => {
    if (/INSERT INTO rooms/.test(sql)) {
      throw Object.assign(new Error('new row for relation "rooms" violates check constraint "rooms_layout_y_check"'), {
        code,
        constraint: 'rooms_layout_y_check',
      })
    }
    return []
  }
}

const settle = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e)

describe('room upsert: layout clamp and CHECK violations (R1)', () => {
  afterEach(() => query.mockReset())

  it('e. clamps layout values into 0..100 before the INSERT', async () => {
    query.mockImplementation(async () => [])
    const { handlePersist } = await import('./writes.js')
    await handlePersist(body as never)
    const insert = query.mock.calls.find(([sql]) => /INSERT INTO rooms/.test(String(sql)))
    expect(insert, 'INSERT INTO rooms issued').toBeTruthy()
    expect((insert![1] as unknown[]).slice(8, 12)).toEqual([0, 100, 42.46, 28])
  })

  it('f. a 23514 from the INSERT is a 400 INVALID_FIELD_VALUE naming the constraint', async () => {
    query.mockImplementation(insertThrows('23514'))
    const { handlePersist } = await import('./writes.js')
    const { errStatus } = await import('./errStatus.js')
    const err = (await settle(handlePersist(body as never))) as Error & { status?: number; code?: string }
    expect(err).toMatchObject({ status: 400, code: 'INVALID_FIELD_VALUE' })
    expect(err.message).toContain('rooms_layout_y_check')
    expect(errStatus(err)).toBe(400)
  })

  it('g. other pg errors (23502, 22P02) keep their code and stay 500', async () => {
    const { handlePersist } = await import('./writes.js')
    const { errStatus } = await import('./errStatus.js')
    for (const code of ['23502', '22P02']) {
      query.mockImplementation(insertThrows(code))
      const err = await settle(handlePersist(body as never))
      expect(err).toMatchObject({ code })
      expect(errStatus(err)).toBe(500)
    }
  })
})
