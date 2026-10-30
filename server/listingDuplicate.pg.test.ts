import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * H1 r5 item 8 against a REAL scratch Postgres (never live). Runs only when
 * PF_TEST_PG_URL points at a throwaway local database; the H1 proof runs it
 * (h1-proofs). Uses the real findDuplicateLead SQL and the real
 * appendRepeatNote SQL from the code under test.
 */
const url = process.env.PF_TEST_PG_URL
const UNIT = 'c1000001-0001-4000-8000-000000000001'
const OTHER_UNIT = 'c1000001-0001-4000-8000-000000000002'

describe.skipIf(!url)('H1 item 8 duplicate SQL on real Postgres', () => {
  let db: typeof import('./db.js')
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    db = await import('./db.js')
    await db.query(`DROP TABLE IF EXISTS leads`)
    await db.query(`CREATE TABLE leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), unit_id uuid, email text, phone text,
      notes text, is_waitlisted boolean DEFAULT false, created_at timestamptz DEFAULT now(), updated_at timestamptz)`)
  })
  afterAll(async () => {
    await db.query(`DROP TABLE IF EXISTS leads`)
  })
  beforeEach(async () => {
    await db.query(`TRUNCATE leads`)
  })
  const insert = async (email: string | null, phone: string | null, unit = UNIT) =>
    (await db.query<{ id: string }>(`INSERT INTO leads (unit_id, email, phone) VALUES ($1::uuid, $2, $3) RETURNING id::text AS id`, [unit, email, phone]))[0]!.id

  it('a different email with the same phone and unit is NOT a duplicate', async () => {
    const { findDuplicateLead } = await import('./listingLimits.js')
    await insert('partner.one@example.com', '0821112222')
    expect(await findDuplicateLead(UNIT, null, 'partner.two@example.com', '0821112222')).toBeNull()
  })

  it('the same email (any case) and unit is a duplicate; another unit is not', async () => {
    const { findDuplicateLead } = await import('./listingLimits.js')
    const id = await insert('same@example.com', '0821112222')
    expect(await findDuplicateLead(UNIT, null, 'SAME@example.com', '0839999999')).toBe(id)
    expect(await findDuplicateLead(OTHER_UNIT, null, 'same@example.com', '')).toBeNull()
  })

  it('no email: the same phone and unit folds', async () => {
    const { findDuplicateLead } = await import('./listingLimits.js')
    const id = await insert(null, '0821112222')
    expect(await findDuplicateLead(UNIT, null, '', '0821112222')).toBe(id)
    expect(await findDuplicateLead(UNIT, null, '', '')).toBeNull()
  })

  it('appendRepeatNote appends once and never overwrites', async () => {
    const { appendRepeatNote } = await import('./publicEnquiry.js')
    const id = await insert('n@example.com', null)
    await db.query(`UPDATE leads SET notes = 'Original note' WHERE id = $1::uuid`, [id])
    expect(await appendRepeatNote(id, 'A new question')).toBe(true)
    expect(await appendRepeatNote(id, 'A new question')).toBe(false)
    expect(await appendRepeatNote(id, 'original   NOTE')).toBe(false)
    const notes = (await db.query<{ notes: string }>(`SELECT notes FROM leads WHERE id = $1::uuid`, [id]))[0]!.notes
    expect(notes.startsWith('Original note')).toBe(true)
    expect(notes.split('A new question')).toHaveLength(2)
  })
})
