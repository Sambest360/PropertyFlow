import { describe, expect, it, vi } from 'vitest'

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: vi.fn() },
}))

vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(),
  ensureUuid: vi.fn(),
  resolveUuid: vi.fn(),
  forgetId: vi.fn(),
  isUuid: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

describe('APP_STAGE_TO_DB Mode A Deposit paid', () => {
  it('maps Title-Case Deposit Paid and Mode A Deposit paid to APPROVED', async () => {
    const { APP_STAGE_TO_DB } = await import('./writes.js')
    expect(APP_STAGE_TO_DB['Deposit Paid']).toBe('APPROVED')
    expect(APP_STAGE_TO_DB['Deposit paid']).toBe('APPROVED')
  })
})
