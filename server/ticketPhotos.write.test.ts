import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Staff ticket photos (Jim / Oscar): upsertTicket reads photoUrls (or photos
 * as a string array), validates them (TICKET_PHOTO_INVALID), keeps stored
 * photos when absent, clears on an explicit [], and audits a drop in count
 * (ticket_photos_removed) in the same transaction.
 */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CA = id(1)
const UN1 = id(10)
const TK = id(50)
const AGENT = id(26)

const query = vi.fn()
const clientQuery = vi.fn()
const withTransaction = vi.fn()
const TX_CLIENT = { tx: true }

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...a: unknown[]) => query(...a),
  clientQuery: (...a: unknown[]) => clientQuery(...a),
  withTransaction: (fn: (c: unknown) => Promise<unknown>) => withTransaction(fn),
  pool: { query: vi.fn() },
}))
vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => undefined),
  resolveUuid: vi.fn(async (_t: string, fe: string) =>
    fe === 'p-1' ? UN1 : fe === 'u-agent' ? AGENT : fe === 'TK-1' ? TK : null,
  ),
  ensureUuid: vi.fn(async () => TK),
  forgetId: vi.fn(),
  isUuid: (v: string) => /^[0-9a-f-]{36}$/i.test(v),
}))
vi.mock('./supabase/registerUser.js', () => ({ linkStaffAuthUser: vi.fn() }))

let storedPhotos: string[] = []
function answer(sqlRaw: string, params: unknown[] = []): unknown[] {
  const sql = sqlRaw.replace(/\s+/g, ' ').trim()
  if (sql.startsWith('SELECT unit_id::text AS unit_id, lease_id::text AS lease_id FROM maintenance_tickets')) {
    return [{ unit_id: UN1, lease_id: null }]
  }
  if (sql.startsWith('SELECT client_id::text AS client_id FROM units WHERE id')) return [{ client_id: CA }]
  if (sql.startsWith('SELECT photos FROM maintenance_tickets WHERE id') && sql.includes('FOR UPDATE')) return [{ photos: storedPhotos }]
  void params
  return []
}

beforeEach(() => {
  storedPhotos = ['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg', 'https://cdn.example/3.jpg']
  query.mockReset()
  query.mockImplementation(async (sql: string, p?: unknown[]) => answer(sql, p))
  clientQuery.mockReset()
  clientQuery.mockImplementation(async (_c: unknown, sql: string, p?: unknown[]) => answer(sql, p))
  withTransaction.mockReset()
  withTransaction.mockImplementation(async (fn: (c: unknown) => Promise<unknown>) => fn(TX_CLIENT))
})

const b64 = (bytes: number) => 'A'.repeat(Math.ceil(bytes / 3) * 4)
const jpeg = (bytes = 300) => `data:image/jpeg;base64,${b64(bytes)}`

async function persist(data: Record<string, unknown>) {
  const { handlePersist } = await import('./writes.js')
  return handlePersist({ resource: 'ticket', action: 'upsert', id: 'TK-1', data: { propertyId: 'p-1', title: 'Geyser', ...data } } as never, 'u-agent')
}
const allCalls = () => [...query.mock.calls.map((c) => [c[0], c[1]]), ...clientQuery.mock.calls.map((c) => [c[1], c[2]])] as Array<[string, unknown[]]>
const insert = () => allCalls().find(([sql]) => String(sql).includes('INSERT INTO maintenance_tickets'))!
const photosParam = () => JSON.parse(String(insert()[1][16])) as string[]
const photosFlag = () => insert()[1][26]
const auditCall = () => clientQuery.mock.calls.find((c) => String(c[1]).includes("'ticket_photos_removed'"))

describe('upsertTicket photos', () => {
  it('saves photoUrls (data:image/jpeg, png, webp and http(s))', async () => {
    const urls = [jpeg(), 'data:image/png;base64,iVBORw0K', 'data:image/webp;base64,UklGRg==', 'https://cdn.example/a.jpg']
    await persist({ photos: 4, photoUrls: urls })
    expect(photosParam()).toEqual(urls)
    expect(photosFlag()).toBe(true)
  })

  it('reads photos when it is an array of strings', async () => {
    await persist({ photos: [jpeg()] })
    expect(photosParam()).toEqual([jpeg()])
  })

  it('a numeric photos count alone keeps the stored photos', async () => {
    await persist({ photos: 2 })
    expect(photosFlag()).toBe(false)
    expect(withTransaction).not.toHaveBeenCalled()
  })

  it('absent photo fields keep the stored photos', async () => {
    await persist({})
    expect(photosFlag()).toBe(false)
  })

  it('an explicit photoUrls: [] or photos: [] clears the photos', async () => {
    await persist({ photoUrls: [] })
    expect(photosFlag()).toBe(true)
    expect(photosParam()).toEqual([])
    query.mockClear()
    clientQuery.mockClear()
    await persist({ photos: [] })
    expect(photosFlag()).toBe(true)
    expect(photosParam()).toEqual([])
  })

  it('invalid images are 400 TICKET_PHOTO_INVALID, never dropped', async () => {
    const bad = [
      ['data:image/gif;base64,R0lGODlh'],
      ['data:image/svg+xml;base64,PHN2Zz4='],
      ['data:text/html;base64,PGgxPg=='],
      ['data:image/jpeg,notbase64'],
      [jpeg(601 * 1024)],
      Array.from({ length: 6 }, () => jpeg(590 * 1024)), // > 3 MB total
    ]
    for (const photoUrls of bad) {
      await expect(persist({ photoUrls })).rejects.toMatchObject({ status: 400, code: 'TICKET_PHOTO_INVALID' })
    }
    expect(allCalls().some(([sql]) => String(sql).includes('INSERT INTO maintenance_tickets'))).toBe(false)
  })

  it('a photo just under 600 KB passes; junk non-URL strings are dropped', async () => {
    await persist({ photoUrls: [jpeg(599 * 1024), 'hello', 'blob:http://x/1', 42, 'https://cdn.example/b.png'] })
    expect(photosParam()).toEqual([jpeg(599 * 1024), 'https://cdn.example/b.png'])
  })

  it('a drop in count writes ticket_photos_removed in the same transaction (counts, no image data)', async () => {
    await persist({ photoUrls: [jpeg()] })
    expect(withTransaction).toHaveBeenCalledTimes(1)
    // Row write and audit both on the transaction client.
    expect(clientQuery.mock.calls.some((c) => c[0] === TX_CLIENT && String(c[1]).includes('INSERT INTO maintenance_tickets'))).toBe(true)
    const audit = auditCall()!
    expect(audit[0]).toBe(TX_CLIENT)
    const [clientId, subject, actor, payloadJson] = audit[2] as [string, string, string, string]
    expect([clientId, subject, actor]).toEqual([CA, TK, AGENT])
    const payload = JSON.parse(payloadJson)
    expect(payload).toMatchObject({ ticketId: 'TK-1', countBefore: 3, countAfter: 1 })
    expect(typeof payload.at).toBe('string')
    expect(payloadJson).not.toMatch(/data:|base64/)
  })

  it('no audit row when the count stays the same or goes up', async () => {
    storedPhotos = ['https://cdn.example/1.jpg']
    await persist({ photoUrls: ['https://cdn.example/1.jpg', jpeg()] })
    expect(auditCall()).toBeUndefined()
    clientQuery.mockClear()
    await persist({ photoUrls: ['https://cdn.example/1.jpg'] })
    expect(auditCall()).toBeUndefined()
  })

  it('Jim #97 nit 1: a swap (same count, a stored photo gone) also writes ticket_photos_removed', async () => {
    await persist({ photoUrls: ['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg', 'https://cdn.example/NEW.jpg'] })
    const audit = auditCall()!
    const payload = JSON.parse(String((audit[2] as unknown[])[3]))
    expect(payload).toMatchObject({ countBefore: 3, countAfter: 3, removedCount: 1 })
  })

  it('Jim #97 blocker: more than 10 photos is 400 TICKET_PHOTO_INVALID', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `https://cdn.example/${i}.jpg`)
    await expect(persist({ photoUrls: eleven })).rejects.toMatchObject({ status: 400, code: 'TICKET_PHOTO_INVALID' })
    expect(allCalls().some(([sql]) => String(sql).includes('INSERT INTO maintenance_tickets'))).toBe(false)
    await persist({ photoUrls: eleven.slice(0, 10) })
    expect(photosParam()).toHaveLength(10)
  })

  it('a failed audit insert rolls the photo change back (it is inside withTransaction)', async () => {
    clientQuery.mockImplementation(async (_c: unknown, sql: string, p?: unknown[]) => {
      if (String(sql).includes("'ticket_photos_removed'")) throw new Error('audit insert failed')
      return answer(sql, p)
    })
    await expect(persist({ photoUrls: [] })).rejects.toThrow('audit insert failed')
    expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO maintenance_tickets'))).toBe(false)
  })
})

describe('#98 access notes share the photo transaction', () => {
  beforeEach(async () => {
    const { resetTicketAccessNotesCache } = await import('./ticketAccessNotes.js')
    resetTicketAccessNotesCache()
    const base = query.getMockImplementation()!
    query.mockImplementation(async (sql: string, p?: unknown[]) =>
      String(sql).includes('information_schema') ? [{ ok: 1 }] : base(sql, p),
    )
  })

  it('the notes UPDATE runs on the same transaction client as the ticket and the audit', async () => {
    await persist({ photoUrls: ['https://cdn.example/1.jpg'], accessNotes: 'Gate 4411' })
    expect(withTransaction).toHaveBeenCalledTimes(1)
    const note = clientQuery.mock.calls.find((c) => String(c[1]).includes('SET access_notes'))
    expect(note?.[0]).toBe(TX_CLIENT)
    expect(note?.[2]).toEqual([TK, 'Gate 4411'])
    expect(auditCall()?.[0]).toBe(TX_CLIENT)
    expect(query.mock.calls.some((c) => String(c[0]).includes('SET access_notes'))).toBe(false)
  })

  it('a failing photo audit rolls back the notes write too', async () => {
    const committed: string[] = []
    withTransaction.mockImplementation(async (fn: (c: unknown) => Promise<unknown>) => {
      const pending: string[] = []
      clientQuery.mockImplementation(async (_c: unknown, sql: string, p?: unknown[]) => {
        if (String(sql).includes("'ticket_photos_removed'")) throw new Error('audit failed')
        pending.push(String(sql))
        return answer(sql, p)
      })
      const out = await fn(TX_CLIENT) // throws before commit: pending discarded
      committed.push(...pending)
      return out
    })
    await expect(persist({ photoUrls: ['https://cdn.example/1.jpg'], accessNotes: 'Gate 4411' })).rejects.toThrow('audit failed')
    expect(committed.some((s) => s.includes('SET access_notes'))).toBe(false)
    expect(query.mock.calls.some((c) => String(c[0]).includes('SET access_notes'))).toBe(false)
  })

  it('notes without photos still use one transaction', async () => {
    await persist({ accessNotes: 'Dog in yard' })
    expect(withTransaction).toHaveBeenCalledTimes(1)
    expect(clientQuery.mock.calls.some((c) => String(c[1]).includes('SET access_notes'))).toBe(true)
  })
})
