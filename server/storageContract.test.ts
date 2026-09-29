/**
 * Storage contract against a local Supabase stack (supabase start, with Storage).
 * Skips when nothing is listening on 127.0.0.1:54321 so CI without the stack still passes.
 *
 * The anon and service-role keys below are the local demo keys printed by
 * `supabase start`. They are not a hosted project.
 */
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrateUserMetadataDocuments } from './migrateIdDocuments.ts'

const { Client } = pg

const API = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const PASSWORD = 'Storage-Test-1'

function stackUp(): boolean {
  try {
    execSync(`curl -sf --max-time 2 ${API}/auth/v1/health`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const run = stackUp()

type Session = { token: string; userId: string; authId: string }

const ids = {
  agencyA: randomUUID(),
  agencyB: randomUUID(),
  buildingA: randomUUID(),
  buildingB: randomUUID(),
  unitA1: randomUUID(),
  unitA2: randomUUID(),
  unitB: randomUUID(),
  ticketA1: randomUUID(),
  ticketA2: randomUUID(),
}

const sessions: {
  tenantA?: Session
  tenantB?: Session
  applicantA?: Session
  applicantB?: Session
  staffA?: Session
  staffB?: Session
} = {}

async function upsertVaultSecret(name: string, value: string) {
  const found = await db<{ id: string }>(
    `SELECT id FROM vault.decrypted_secrets WHERE name = $1 ORDER BY created_at DESC LIMIT 1`,
    [name],
  )
  const id = found.rows[0]?.id
  if (id) {
    await db(`SELECT vault.update_secret($1::uuid, $2, $3, 'local contract test')`, [id, value, name])
    return
  }
  await db(`SELECT vault.create_secret($1, $2, 'local contract test')`, [value, name])
}

async function db<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const client = new Client({ connectionString: DB_URL })
  await client.connect()
  try {
    return await client.query<T>(sql, params)
  } finally {
    await client.end()
  }
}

async function createAuthUser(email: string, role: string, first: string): Promise<string> {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE}`,
      apikey: SERVICE,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role, first_name: first, last_name: 'Storage' },
    }),
  })
  const body = (await res.json()) as { id?: string; msg?: string; message?: string }
  if (!res.ok || !body.id) {
    throw new Error(`create user ${email} failed (${res.status}): ${body.message ?? body.msg ?? JSON.stringify(body)}`)
  }
  return body.id
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const body = (await res.json()) as { access_token?: string; error_description?: string; msg?: string }
  if (!res.ok || !body.access_token) {
    throw new Error(`sign-in ${email} failed (${res.status}): ${body.error_description ?? body.msg ?? JSON.stringify(body)}`)
  }
  return body.access_token
}

async function sessionFor(email: string, role: string, first: string, clientId: string, dbRole: string): Promise<Session> {
  const authId = await createAuthUser(email, role, first)
  await db(
    `UPDATE users SET client_id = $1::uuid, role = $2 WHERE auth_user_id = $3::uuid`,
    [clientId, dbRole, authId],
  )
  const user = await db<{ id: string }>('SELECT id FROM users WHERE auth_user_id = $1::uuid', [authId])
  const userId = user.rows[0]?.id
  if (!userId) throw new Error(`profile missing for ${email}`)
  return { token: await signIn(email), userId, authId }
}

async function upload(
  token: string,
  bucket: string,
  path: string,
  body: Buffer,
  contentType: string,
  upsert: boolean,
) {
  const res = await fetch(`${API}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ANON,
      'Content-Type': contentType,
      'x-upsert': upsert ? 'true' : 'false',
    },
    body,
  })
  const text = await res.text()
  return { status: res.status, text }
}

async function rpc(token: string | null, fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token ?? ANON}`,
      apikey: ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const text = await res.text()
  return { status: res.status, text }
}

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
const pdf = Buffer.from('%PDF-1.1\n%%EOF\n')

describe.skipIf(!run)('private storage contract', () => {
  const stamp = Date.now()

  beforeAll(async () => {
    const ready = await db<{ fn: string | null; clients: string | null }>(
      `SELECT to_regprocedure('public.register_file(text,text,text,uuid,text)')::text AS fn,
              to_regclass('public.clients')::text AS clients`,
    )
    if (!ready.rows[0]?.clients) {
      execSync(`psql "${DB_URL}" -v ON_ERROR_STOP=1 -f database/postgres/schema.sql`, { stdio: 'inherit' })
      execSync(`psql "${DB_URL}" -v ON_ERROR_STOP=1 -f database/postgres/migrations/002_supabase_auth.sql`, {
        stdio: 'inherit',
      })
    }
    if (!ready.rows[0]?.fn) {
      execSync(`psql "${DB_URL}" -v ON_ERROR_STOP=1 -f database/postgres/migrations/013_storage.sql`, {
        stdio: 'inherit',
      })
    }

    await upsertVaultSecret('storage_jwt_secret', 'super-secret-jwt-token-with-at-least-32-characters-long')
    await upsertVaultSecret('supabase_url', API)
    await upsertVaultSecret('storage_api_url', 'http://kong:8000')
    await upsertVaultSecret('storage_service_role_key', SERVICE)

    await db(
      `INSERT INTO clients (id, company_name, subdomain) VALUES
         ($1::uuid, 'Storage Agency A', $2),
         ($3::uuid, 'Storage Agency B', $4)`,
      [ids.agencyA, `storage-a-${stamp}`, ids.agencyB, `storage-b-${stamp}`],
    )
    await db(
      `INSERT INTO buildings (id, client_id, name, address, city, province) VALUES
         ($1::uuid, $2::uuid, 'A', '1', 'Cape Town', 'WC'),
         ($3::uuid, $4::uuid, 'B', '2', 'Cape Town', 'WC')`,
      [ids.buildingA, ids.agencyA, ids.buildingB, ids.agencyB],
    )
    await db(
      `INSERT INTO units (id, building_id, client_id, unit_number) VALUES
         ($1::uuid, $2::uuid, $3::uuid, '1'),
         ($4::uuid, $2::uuid, $3::uuid, '2'),
         ($5::uuid, $6::uuid, $7::uuid, '1')`,
      [ids.unitA1, ids.buildingA, ids.agencyA, ids.unitA2, ids.unitB, ids.buildingB, ids.agencyB],
    )

    // First auth user becomes super admin. Create them before the subjects.
    await createAuthUser(`storage-boot-${stamp}@storage.test`, 'tenant', 'Boot')
    sessions.staffA = await sessionFor(`storage-staff-a-${stamp}@storage.test`, 'agency_admin', 'StaffA', ids.agencyA, 'AGENCY_ADMIN')
    sessions.staffB = await sessionFor(`storage-staff-b-${stamp}@storage.test`, 'agency_admin', 'StaffB', ids.agencyB, 'AGENCY_ADMIN')
    sessions.tenantA = await sessionFor(`storage-tenant-a-${stamp}@storage.test`, 'tenant', 'TenantA', ids.agencyA, 'END_USER')
    sessions.tenantB = await sessionFor(`storage-tenant-b-${stamp}@storage.test`, 'tenant', 'TenantB', ids.agencyA, 'END_USER')
    sessions.applicantA = await sessionFor(`storage-applicant-a-${stamp}@storage.test`, 'tenant', 'ApplicantA', ids.agencyA, 'END_USER')
    sessions.applicantB = await sessionFor(`storage-applicant-b-${stamp}@storage.test`, 'tenant', 'ApplicantB', ids.agencyA, 'END_USER')

    await db(
      `INSERT INTO maintenance_tickets (id, client_id, unit_id, reported_by, title, description) VALUES
         ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'Leak A', 'Tap'),
         ($5::uuid, $2::uuid, $6::uuid, $7::uuid, 'Leak B', 'Tap')`,
      [
        ids.ticketA1, ids.agencyA, ids.unitA1, sessions.tenantA.userId,
        ids.ticketA2, ids.unitA2, sessions.tenantB.userId,
      ],
    )
  }, 60_000)

  afterAll(async () => {
    if (!run) return
    await db(`DELETE FROM clients WHERE id IN ($1::uuid, $2::uuid)`, [ids.agencyA, ids.agencyB]).catch(() => undefined)
    const emails = [
      `storage-boot-${stamp}@storage.test`,
      `storage-staff-a-${stamp}@storage.test`,
      `storage-staff-b-${stamp}@storage.test`,
      `storage-tenant-a-${stamp}@storage.test`,
      `storage-tenant-b-${stamp}@storage.test`,
      `storage-applicant-a-${stamp}@storage.test`,
      `storage-applicant-b-${stamp}@storage.test`,
    ]
    for (const email of emails) {
      const found = await db<{ id: string }>('SELECT id FROM auth.users WHERE email = $1', [email]).catch(() => null)
      const id = found?.rows[0]?.id
      if (!id) continue
      await fetch(`${API}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE },
      }).catch(() => undefined)
    }
  })

  it('refuses a tenant attaching a file to another tenant ticket', async () => {
    const tenantA = sessions.tenantA!
    const path = `${ids.agencyA}/ticket/${ids.ticketA2}/${randomUUID()}.pdf`
    const up = await upload(tenantA.token, 'documents', path, pdf, 'application/pdf', false)
    expect(up.status).toBeGreaterThanOrEqual(400)

    const registered = await rpc(tenantA.token, 'register_file', {
      bucket: 'documents',
      path,
      entity_type: 'ticket',
      entity_id: ids.ticketA2,
      kind: 'attachment',
    })
    expect(registered.status).toBeGreaterThanOrEqual(400)
    expect(registered.text).toContain('Forbidden')
  })

  it('lets an applicant read only their own ID document', async () => {
    const a = sessions.applicantA!
    const b = sessions.applicantB!
    const fileA = randomUUID()
    const fileB = randomUUID()
    const pathA = `${ids.agencyA}/user/${a.userId}/${fileA}.pdf`
    const pathB = `${ids.agencyA}/user/${b.userId}/${fileB}.pdf`

    const upA = await upload(a.token, 'documents', pathA, pdf, 'application/pdf', false)
    expect(upA.status).toBe(200)
    const upB = await upload(b.token, 'documents', pathB, pdf, 'application/pdf', false)
    expect(upB.status).toBe(200)

    const regA = await rpc(a.token, 'register_file', {
      bucket: 'documents',
      path: pathA,
      entity_type: 'user',
      entity_id: a.userId,
      kind: 'id_document',
    })
    expect(regA.status).toBe(200)
    expect(regA.text).toContain(fileA)
    const regB = await rpc(b.token, 'register_file', {
      bucket: 'documents',
      path: pathB,
      entity_type: 'user',
      entity_id: b.userId,
      kind: 'id_document',
    })
    expect(regB.status).toBe(200)

    const own = await rpc(a.token, 'entity_files', { entity_type: 'user', entity_id: a.userId })
    expect(own.status).toBe(200)
    const ownBody = JSON.parse(own.text) as { files: { file_id: string; kind: string; url: string; expires_at: string }[] }
    expect(ownBody.files.map((f) => f.file_id)).toEqual([fileA])
    expect(ownBody.files[0]?.kind).toBe('id_document')
    const expires = new Date(ownBody.files[0]!.expires_at).getTime()
    expect(expires).toBeGreaterThan(Date.now() + 50 * 60 * 1000)
    expect(expires).toBeLessThan(Date.now() + 70 * 60 * 1000)
    const downloaded = await fetch(ownBody.files[0]!.url)
    expect(downloaded.status).toBe(200)
    expect(Buffer.from(await downloaded.arrayBuffer()).equals(pdf)).toBe(true)

    const other = await rpc(a.token, 'entity_files', { entity_type: 'user', entity_id: b.userId })
    expect(other.status).toBeGreaterThanOrEqual(400)
    expect(other.text).toContain('Forbidden')
    expect(other.text).not.toContain(fileB)

    const listed = await fetch(`${API}/rest/v1/stored_files?select=id`, {
      headers: { Authorization: `Bearer ${a.token}`, apikey: ANON },
    })
    const rows = (await listed.json()) as { id: string }[]
    expect(rows.map((row) => row.id)).toContain(fileA)
    expect(rows.map((row) => row.id)).not.toContain(fileB)

    const stolen = await fetch(`${API}/storage/v1/object/documents/${pathB}`, {
      headers: { Authorization: `Bearer ${a.token}`, apikey: ANON },
    })
    expect(stolen.status).toBeGreaterThanOrEqual(400)
  })

  it('refuses cross-agency access', async () => {
    const staffB = sessions.staffB!
    const path = `${ids.agencyA}/ticket/${ids.ticketA1}/${randomUUID()}.pdf`
    const up = await upload(staffB.token, 'documents', path, pdf, 'application/pdf', false)
    expect(up.status).toBeGreaterThanOrEqual(400)

    const read = await rpc(staffB.token, 'entity_files', { entity_type: 'ticket', entity_id: ids.ticketA1 })
    expect(read.status).toBeGreaterThanOrEqual(400)
    expect(read.text).toContain('Forbidden')

    const anon = await rpc(null, 'register_file', {
      bucket: 'documents',
      path,
      entity_type: 'ticket',
      entity_id: ids.ticketA1,
      kind: 'attachment',
    })
    expect(anon.status).toBeGreaterThanOrEqual(400)
  })

  it('refuses an oversize image', async () => {
    const staffA = sessions.staffA!
    const path = `${ids.agencyA}/unit/${ids.unitA1}/${randomUUID()}.jpg`
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1)
    const up = await upload(staffA.token, 'property-media', path, big, 'image/jpeg', false)
    expect(up.status).toBeGreaterThanOrEqual(400)
  })

  it('returns the file id from the path', async () => {
    const staffA = sessions.staffA!
    const fileId = randomUUID()
    const path = `${ids.agencyA}/unit/${ids.unitA1}/${fileId}.jpg`
    const up = await upload(staffA.token, 'property-media', path, jpeg, 'image/jpeg', false)
    expect(up.status).toBe(200)

    const registered = await rpc(staffA.token, 'register_file', {
      bucket: 'property-media',
      path,
      entity_type: 'unit',
      entity_id: ids.unitA1,
      kind: 'property_image',
    })
    expect(registered.status).toBe(200)
    const body = JSON.parse(registered.text) as { file_id: string }
    expect(body.file_id).toBe(fileId)

    const listed = await rpc(staffA.token, 'list_files', {
      entity_type: 'unit',
      entity_id: ids.unitA1,
    })
    expect(listed.status).toBe(200)
    const files = (JSON.parse(listed.text) as { files: { file_id: string }[] }).files
    expect(files.map((file) => file.file_id)).toContain(fileId)

    const byId = await rpc(staffA.token, 'list_files', { file_id: fileId })
    expect(byId.status).toBe(200)
    expect(JSON.parse(byId.text)).toMatchObject({ files: [{ file_id: fileId, kind: 'property_image' }] })
  })

  it('refuses registering the same path twice', async () => {
    const staffA = sessions.staffA!
    const fileId = randomUUID()
    const path = `${ids.agencyA}/unit/${ids.unitA1}/${fileId}.jpg`
    expect((await upload(staffA.token, 'property-media', path, jpeg, 'image/jpeg', false)).status).toBe(200)

    const args = {
      bucket: 'property-media',
      path,
      entity_type: 'unit',
      entity_id: ids.unitA1,
      kind: 'property_image',
    }
    const first = await rpc(staffA.token, 'register_file', args)
    expect(first.status).toBe(200)
    expect((JSON.parse(first.text) as { file_id: string }).file_id).toBe(fileId)

    const second = await rpc(staffA.token, 'register_file', args)
    expect(second.status).toBeGreaterThanOrEqual(400)
    expect(second.text).toContain('Already registered')
  })

  it('refuses an overwrite', async () => {
    const staffA = sessions.staffA!
    const path = `${ids.agencyA}/unit/${ids.unitA1}/${randomUUID()}.jpg`
    const first = await upload(staffA.token, 'property-media', path, jpeg, 'image/jpeg', false)
    expect(first.status).toBe(200)
    const again = await upload(staffA.token, 'property-media', path, jpeg, 'image/jpeg', true)
    expect(again.status).toBeGreaterThanOrEqual(400)
  })

  it('moves an ID document off users.metadata and leaves a signed file', async () => {
    const applicant = sessions.applicantA!
    const dataUrl = `data:application/pdf;base64,${pdf.toString('base64')}`
    await db(
      `UPDATE users SET metadata = jsonb_build_object(
         'verification', jsonb_build_object(
           'status', 'pending',
           'documents', jsonb_build_array(jsonb_build_object(
             'key', 'id_copy',
             'label', 'ID or passport copy',
             'name', 'id.pdf',
             'mimeType', 'application/pdf',
             'dataUrl', $2::text
           ))
         )
       ) WHERE id = $1::uuid`,
      [applicant.userId, dataUrl],
    )

    const result = await migrateUserMetadataDocuments({
      databaseUrl: DB_URL,
      supabaseUrl: API,
      serviceRoleKey: SERVICE,
    })
    expect(result.migrated).toBeGreaterThanOrEqual(1)
    expect(result.pending).toBe(0)

    const meta = await db<{ metadata: { verification?: { documents?: { dataUrl?: string; file_id?: string }[] } } }>(
      'SELECT metadata FROM users WHERE id = $1::uuid',
      [applicant.userId],
    )
    const doc = meta.rows[0]?.metadata.verification?.documents?.[0]
    expect(doc?.dataUrl).toBeUndefined()
    expect(doc?.file_id).toBeTruthy()
    expect(JSON.stringify(meta.rows[0]?.metadata)).not.toContain('data:')

    const read = await rpc(applicant.token, 'entity_files', { entity_type: 'user', entity_id: applicant.userId })
    expect(read.status).toBe(200)
    expect(read.text).toContain(doc!.file_id!)
  })

  it('sweeps unregistered objects older than 24 hours', async () => {
    const staffA = sessions.staffA!
    const stalePath = `${ids.agencyA}/unit/${ids.unitA1}/${randomUUID()}.jpg`
    const freshPath = `${ids.agencyA}/unit/${ids.unitA1}/${randomUUID()}.jpg`
    expect((await upload(staffA.token, 'property-media', stalePath, jpeg, 'image/jpeg', false)).status).toBe(200)
    expect((await upload(staffA.token, 'property-media', freshPath, jpeg, 'image/jpeg', false)).status).toBe(200)
    await db(
      `UPDATE storage.objects SET created_at = now() - interval '25 hours' WHERE name = $1`,
      [stalePath],
    )
    const swept = await db<{ sweep_unregistered_storage: number }>('SELECT public.sweep_unregistered_storage()')
    expect(swept.rows[0]?.sweep_unregistered_storage).toBeGreaterThanOrEqual(1)
    const left = await db<{ name: string }>(
      'SELECT name FROM storage.objects WHERE name = ANY($1::text[])',
      [[stalePath, freshPath]],
    )
    expect(left.rows.map((row) => row.name)).toEqual([freshPath])
  })
})
