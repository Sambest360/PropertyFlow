import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * Kelly PR A Test 6 + A2 mutants + A15: title/type confirm on persist and
 * listing approval, against a throwaway scratch Postgres (PF_TEST_PG_URL).
 * Run this file on its own with --no-file-parallelism.
 */
const url = process.env.PF_TEST_PG_URL

const CLIENT = 'c7a10000-0000-4000-8000-000000000001'
const AGENT = 'c7a10000-0000-4000-8000-000000000011'
const SUPER = 'c7a10000-0000-4000-8000-000000000012'
const AG_FE = 'ag-ltt-a'
const AGENT_FE = 'u-ltt-agent'
const SUPER_FE = 'u-ltt-super'
const HOUSE = 'p-ltt-house'
const INDUSTRIAL = 'p-ltt-ind'
const STALE = 'p-ltt-stale'
const APPROVE = 'p-ltt-approve'

const HOUSE_TITLE = '3 Bedroom House to Rent in Pinelands'
const INDUSTRIAL_TITLE = 'Industrial Property to Rent in Fairview'
const PLAIN_SENTENCE =
  "The listing title and the chosen type don't match. Change the type, or confirm you want to publish with this title."

type PersistErr = { status?: number; code?: string; message?: string }

describe.skipIf(!url)('listing title/type confirm (Test 6, A2, A15)', () => {
  let db: typeof import('./db.js')
  let handlePersist: typeof import('./writes.js').handlePersist

  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    db.query<T>(sql, params as never)

  async function cleanup() {
    await q(`DELETE FROM listing_approvals WHERE unit_id IN (SELECT id FROM units WHERE client_id = $1::uuid)`, [CLIENT]).catch(() => undefined)
    await q(`DELETE FROM notifications WHERE client_id = $1::uuid`, [CLIENT]).catch(() => undefined)
    await q(`DELETE FROM event_log WHERE client_id = $1::uuid OR subject_id IN (SELECT id FROM units WHERE client_id = $1::uuid)`, [CLIENT]).catch(() => undefined)
    await q(`DELETE FROM rooms WHERE client_id = $1::uuid`, [CLIENT]).catch(() => undefined)
    await q(`DELETE FROM units WHERE client_id = $1::uuid`, [CLIENT]).catch(() => undefined)
    await q(`DELETE FROM buildings WHERE client_id = $1::uuid`, [CLIENT]).catch(() => undefined)
    await q(
      `DELETE FROM entity_id_map WHERE frontend_id LIKE 'p-ltt-%' OR frontend_id LIKE 'unt-p-ltt-%' OR frontend_id IN ($1, $2, $3)`,
      [AG_FE, AGENT_FE, SUPER_FE],
    ).catch(() => undefined)
    await q(`DELETE FROM users WHERE id IN ($1::uuid, $2::uuid)`, [AGENT, SUPER]).catch(() => undefined)
    await q(`DELETE FROM clients WHERE id = $1::uuid`, [CLIENT]).catch(() => undefined)
  }

  const persist = async (
    id: string,
    data: Record<string, unknown>,
    actorUserId: string = SUPER,
    actorRole: string | null = 'super_admin',
  ) => {
    try {
      const res = await handlePersist({ resource: 'property', action: 'upsert', id, data }, actorUserId, actorRole)
      return { ok: true as const, status: 200 as const, uuid: res.uuid, code: null as string | null, message: null as string | null }
    } catch (err) {
      const e = err as PersistErr
      return { ok: false as const, status: e.status ?? 500, uuid: null as string | null, code: e.code ?? null, message: e.message ?? String(err) }
    }
  }

  const unitOf = async (fe: string) => {
    const mapped = await q<{ backend_id: string }>(
      `SELECT backend_id::text AS backend_id FROM entity_id_map WHERE frontend_id = $1 AND entity_type IN ('property', 'unit') LIMIT 1`,
      [fe],
    )
    const id = mapped[0]?.backend_id
    if (!id) return undefined
    return (
      await q<{
        id: string
        status: string
        title: string | null
        property_type: string | null
      }>(
        `SELECT id::text AS id, status_config_key AS status, title, property_type FROM units WHERE id = $1::uuid`,
        [id],
      )
    )[0]
  }

  const confirms = async (unitId: string) =>
    q<{
      actor_user_id: string | null
      created_at: string | null
      payload: { title?: string; type?: string; warning?: string }
    }>(
      `SELECT actor_user_id::text AS actor_user_id, created_at::text AS created_at, payload
         FROM event_log WHERE event_type = 'listing_title_type_confirmed' AND subject_id = $1::uuid
         ORDER BY created_at`,
      [unitId],
    )

  const approvalSnap = async (unitId: string) =>
    (
      await q<{
        status: string
        requested_at: string
        reviewed_at: string | null
        reviewed_by: string | null
        note: string | null
        xmin: string
      }>(
        `SELECT status, requested_at::text AS requested_at, reviewed_at::text AS reviewed_at,
                reviewed_by::text AS reviewed_by, note, xmin::text AS xmin
           FROM listing_approvals WHERE unit_id = $1::uuid`,
        [unitId],
      )
    )[0]

  const payload = (over: Record<string, unknown>) => ({
    title: HOUSE_TITLE,
    type: 'Apartment',
    status: 'Draft',
    statusKey: 'DRAFT',
    agencyId: AG_FE,
    agentId: AGENT_FE,
    listingMode: 'rent',
    rent: 8500,
    ...over,
  })

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    db = await import('./db.js')
    await cleanup()
    await q(`INSERT INTO clients (id, company_name, subdomain) VALUES ($1::uuid, 'LTT Agency', 'ltt-a')`, [CLIENT])
    await q(`INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', $1, $2::uuid)`, [AG_FE, CLIENT])
    await q(
      `INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, role, active)
       VALUES ($1::uuid, $2::uuid, $3, 'x', 'Ltt', 'Agent', 'AGENT_ADMIN', TRUE),
              ($4::uuid, NULL, $5, 'x', 'Ltt', 'Super', 'SUPER_ADMIN', TRUE)`,
      [AGENT, CLIENT, `${AGENT_FE}@example.test`, SUPER, `${SUPER_FE}@example.test`],
    )
    await q(
      `INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', $1, $2::uuid), ('user', $3, $4::uuid)`,
      [AGENT_FE, AGENT, SUPER_FE, SUPER],
    )
    ;({ handlePersist } = await import('./writes.js'))
    const approvals = await import('./listingApprovals.js')
    await approvals.ensureListingApprovalsTable()
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(async () => {
    await q(`DELETE FROM listing_approvals WHERE unit_id IN (SELECT id FROM units WHERE client_id = $1::uuid)`, [CLIENT]).catch(() => undefined)
    await q(`DELETE FROM notifications WHERE client_id = $1::uuid`, [CLIENT]).catch(() => undefined)
    await q(`DELETE FROM event_log WHERE client_id = $1::uuid`, [CLIENT]).catch(() => undefined)
    await q(`DELETE FROM rooms WHERE client_id = $1::uuid`, [CLIENT]).catch(() => undefined)
    await q(`DELETE FROM units WHERE client_id = $1::uuid`, [CLIENT]).catch(() => undefined)
    await q(`DELETE FROM buildings WHERE client_id = $1::uuid`, [CLIENT]).catch(() => undefined)
    await q(`DELETE FROM entity_id_map WHERE frontend_id LIKE 'p-ltt-%' OR frontend_id LIKE 'unt-p-ltt-%'`).catch(() => undefined)
  })

  it('T6: a draft save of a mismatched title/type is 200 and writes no confirm row', async () => {
    const res = await persist(HOUSE, payload({ title: HOUSE_TITLE, type: 'Apartment', status: 'Draft', statusKey: 'DRAFT' }))
    expect(res.status).toBe(200)
    const unit = await unitOf(HOUSE)
    expect(unit?.status).toBe('DRAFT')
    expect(unit && (await confirms(unit.id))).toEqual([])
  })

  it('T6: publish without a confirm is 409 TITLE_TYPE_CONFIRMATION_REQUIRED and the row stays draft', async () => {
    await persist(HOUSE, payload({ status: 'Draft', statusKey: 'DRAFT' }))
    const before = await unitOf(HOUSE)
    expect(before?.status).toBe('DRAFT')
    const res = await persist(HOUSE, payload({ status: 'Published', statusKey: 'PUBLISHED' }))
    expect(res.status).toBe(409)
    expect(res.code).toBe('TITLE_TYPE_CONFIRMATION_REQUIRED')
    expect(res.message).not.toContain('TITLE_TYPE_CONFIRMATION_REQUIRED')
    const after = await unitOf(HOUSE)
    expect(after?.status).toBe('DRAFT')
    expect(after && (await confirms(after.id))).toEqual([])
  })

  it('T6: the industrial title against type Apartment is also refused without a confirm', async () => {
    await persist(INDUSTRIAL, payload({ title: INDUSTRIAL_TITLE, type: 'Apartment', status: 'Draft', statusKey: 'DRAFT' }))
    const res = await persist(INDUSTRIAL, payload({ title: INDUSTRIAL_TITLE, type: 'Apartment', status: 'Published', statusKey: 'PUBLISHED' }))
    expect(res.status).toBe(409)
    expect(res.code).toBe('TITLE_TYPE_CONFIRMATION_REQUIRED')
    expect((await unitOf(INDUSTRIAL))?.status).toBe('DRAFT')
  })

  it('T6: publish with titleTypeConfirmed: true succeeds and records who and when', async () => {
    await persist(HOUSE, payload({ status: 'Draft', statusKey: 'DRAFT' }))
    const res = await persist(HOUSE, payload({ status: 'Published', statusKey: 'PUBLISHED', titleTypeConfirmed: true }))
    expect(res.status).toBe(200)
    const unit = await unitOf(HOUSE)
    expect(unit?.status).toBe('PUBLISHED')
    const rows = unit ? await confirms(unit.id) : []
    expect(rows).toHaveLength(1)
    expect(rows[0]?.actor_user_id).toBe(SUPER)
    expect(rows[0]?.created_at).toBeTruthy()
    expect(rows[0]?.payload.title).toBe(HOUSE_TITLE)
    expect(String(rows[0]?.payload.type).toLowerCase()).toMatch(/apartment/)
    expect(rows[0]?.payload.warning).toBeTruthy()
  })

  it('T6 / Q5: a second persist of the same unit+title+type does not write a second confirm row', async () => {
    await persist(HOUSE, payload({ status: 'Draft', statusKey: 'DRAFT' }))
    expect((await persist(HOUSE, payload({ status: 'Published', statusKey: 'PUBLISHED', titleTypeConfirmed: true }))).status).toBe(200)
    const unit = await unitOf(HOUSE)
    expect(unit).toBeTruthy()
    expect((await persist(HOUSE, payload({ status: 'Published', statusKey: 'PUBLISHED', titleTypeConfirmed: true }))).status).toBe(200)
    expect(await confirms(unit!.id)).toHaveLength(1)
  })

  it('A2(d): a confirm for title T1 does not cover title T2; republish of T1 without a new flag is allowed', async () => {
    await persist(STALE, payload({ title: HOUSE_TITLE, status: 'Draft', statusKey: 'DRAFT' }))
    expect((await persist(STALE, payload({ title: HOUSE_TITLE, status: 'Published', statusKey: 'PUBLISHED', titleTypeConfirmed: true }))).status).toBe(200)
    const unit = await unitOf(STALE)
    expect(unit).toBeTruthy()
    expect(await confirms(unit!.id)).toHaveLength(1)

    const stale = await persist(STALE, payload({ title: INDUSTRIAL_TITLE, type: 'Apartment', status: 'Published', statusKey: 'PUBLISHED' }))
    expect(stale.status).toBe(409)
    expect(stale.code).toBe('TITLE_TYPE_CONFIRMATION_REQUIRED')
    expect(await confirms(unit!.id)).toHaveLength(1)

    const again = await persist(STALE, payload({ title: HOUSE_TITLE, type: 'Apartment', status: 'Published', statusKey: 'PUBLISHED' }))
    expect(again.status).toBe(200)
    expect(await confirms(unit!.id)).toHaveLength(1)
  })

  it('A2(b): titleTypeConfirmed: true on a new title/type writes a matching confirm row (the flag alone is not enough)', async () => {
    await persist(STALE, payload({ title: HOUSE_TITLE, status: 'Draft', statusKey: 'DRAFT' }))
    expect((await persist(STALE, payload({ title: HOUSE_TITLE, status: 'Published', statusKey: 'PUBLISHED', titleTypeConfirmed: true }))).status).toBe(200)
    const unit = await unitOf(STALE)
    const second = await persist(STALE, payload({ title: INDUSTRIAL_TITLE, type: 'Apartment', status: 'Published', statusKey: 'PUBLISHED', titleTypeConfirmed: true }))
    expect(second.status).toBe(200)
    const rows = await confirms(unit!.id)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.payload.title)).toContain(INDUSTRIAL_TITLE)
  })

  it('A15 / A2(c): approve of a pending listing whose current title/type warn and have no matching confirm is 409; request stays pending; no rejected notification', async () => {
    // Request publish on a matching title, then edit the draft title so the stored confirm no longer matches.
    await persist(
      APPROVE,
      payload({ title: 'Sunny apartment in Pinelands', type: 'Apartment', status: 'Draft', statusKey: 'DRAFT' }),
      AGENT,
      'client_admin',
    )
    expect(
      (
        await persist(
          APPROVE,
          payload({ title: 'Sunny apartment in Pinelands', type: 'Apartment', status: 'Published', statusKey: 'PUBLISHED' }),
          AGENT,
          'client_admin',
        )
      ).status,
    ).toBe(200)
    const unit = await unitOf(APPROVE)
    expect(unit?.status).toBe('DRAFT')
    await persist(
      APPROVE,
      payload({ title: HOUSE_TITLE, type: 'Apartment', status: 'Draft', statusKey: 'DRAFT' }),
      AGENT,
      'client_admin',
    )
    expect(await confirms(unit!.id)).toEqual([])

    const before = await approvalSnap(unit!.id)
    expect(before?.status).toBe('pending')
    const notifBefore = Number((await q<{ n: string }>(`SELECT count(*)::text AS n FROM notifications WHERE client_id = $1::uuid`, [CLIENT]))[0]?.n ?? '0')

    const approvals = (await import('./listingApprovals.js')) as typeof import('./listingApprovals.js') & {
      applyListingApproval?: (opts: {
        unitId: string
        decision: 'approved' | 'declined'
        note: string
        reviewerUserId: string | null
      }) => Promise<{ ok: true; status: string }>
    }
    expect(approvals).toHaveProperty('applyListingApproval')
    let thrown: PersistErr | undefined
    try {
      await approvals.applyListingApproval!({
        unitId: unit!.id,
        decision: 'approved',
        note: '',
        reviewerUserId: SUPER,
      })
    } catch (err) {
      thrown = err as PersistErr
    }
    expect(thrown?.status).toBe(409)
    expect(thrown?.code).toBe('TITLE_TYPE_CONFIRMATION_REQUIRED')
    expect(thrown?.message).toBeTruthy()
    expect(thrown?.message).toContain(PLAIN_SENTENCE)
    expect(thrown?.message).not.toContain('TITLE_TYPE_CONFIRMATION_REQUIRED')
    expect(thrown?.message).toContain(`/workspace/properties/${APPROVE}/edit`)

    const after = await approvalSnap(unit!.id)
    expect(after?.status).toBe('pending')
    expect(after?.requested_at).toBe(before?.requested_at)
    expect(after?.reviewed_at).toBe(before?.reviewed_at)
    expect(after?.reviewed_by).toBe(before?.reviewed_by)
    expect(after?.note).toBe(before?.note)
    expect(after?.xmin).toBe(before?.xmin)
    expect((await unitOf(APPROVE))?.status).toBe('DRAFT')

    const notifAfter = Number((await q<{ n: string }>(`SELECT count(*)::text AS n FROM notifications WHERE client_id = $1::uuid`, [CLIENT]))[0]?.n ?? '0')
    expect(notifAfter).toBe(notifBefore)
  })

  it('D1: a garden-flat title with no chosen type publishes without a confirm', async () => {
    const { type: _omit, ...noType } = payload({
      title: 'Garden flat to rent in Walmer',
      status: 'Published',
      statusKey: 'PUBLISHED',
    })
    const res = await persist('p-ltt-garden', noType)
    expect(res.status).toBe(200)
    const unit = await unitOf('p-ltt-garden')
    expect(unit?.status).toBe('PUBLISHED')
    expect(unit?.property_type).toBeNull()
    expect(unit && (await confirms(unit.id))).toEqual([])
  })

  it('D3(i): an explicit type that matches the title is stored even when typeInferred is true', async () => {
    const res = await persist('p-ltt-d3i', payload({ title: HOUSE_TITLE, type: 'House', typeInferred: true, status: 'Draft', statusKey: 'DRAFT' }))
    expect(res.status).toBe(200)
    expect((await unitOf('p-ltt-d3i'))?.property_type?.toLowerCase()).toMatch(/house/)
  })

  it('D3(ii): an explicit type that differs from the title is stored when typeInferred is true', async () => {
    const res = await persist('p-ltt-d3ii', payload({ title: HOUSE_TITLE, type: 'Industrial', typeInferred: true, status: 'Draft', statusKey: 'DRAFT' }))
    expect(res.status).toBe(200)
    expect((await unitOf('p-ltt-d3ii'))?.property_type?.toLowerCase()).toMatch(/industrial/)
  })

  it('D3(iii): empty type does not persist and does not clear a stored type', async () => {
    expect((await persist('p-ltt-d3iii', payload({ title: 'Sunny apartment', type: 'Apartment', status: 'Draft', statusKey: 'DRAFT' }))).status).toBe(200)
    expect((await unitOf('p-ltt-d3iii'))?.property_type?.toLowerCase()).toMatch(/apartment/)
    expect((await persist('p-ltt-d3iii', payload({ title: 'Sunny apartment', type: '', status: 'Draft', statusKey: 'DRAFT' }))).status).toBe(200)
    expect((await unitOf('p-ltt-d3iii'))?.property_type?.toLowerCase()).toMatch(/apartment/)
  })

  it('D3(iv): typeInferred true plus empty type does not persist a guess', async () => {
    const res = await persist('p-ltt-d3iv', payload({ title: HOUSE_TITLE, type: '', typeInferred: true, status: 'Draft', statusKey: 'DRAFT' }))
    expect(res.status).toBe(200)
    expect((await unitOf('p-ltt-d3iv'))?.property_type).toBeNull()
  })

  it('AV3-3 / AV3-14: an untouched edit of an inferred listing keeps units.property_type null', async () => {
    const { type: _omit, ...noType } = payload({ title: HOUSE_TITLE, status: 'Draft', statusKey: 'DRAFT', typeInferred: true })
    expect((await persist('p-ltt-av33', noType)).status).toBe(200)
    expect((await unitOf('p-ltt-av33'))?.property_type).toBeNull()
    const second = await persist('p-ltt-av33', { ...noType, rent: 9900 })
    expect(second.status).toBe(200)
    expect((await unitOf('p-ltt-av33'))?.property_type).toBeNull()
  })
})
