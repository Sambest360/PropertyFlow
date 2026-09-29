/**
 * Direct-connect admin client for seeding WITHOUT a Supabase secret key.
 *
 * Uses the Postgres DIRECT_URL (postgres superuser) to drive auth.users and
 * public tables directly. The `handle_new_auth_user` trigger on auth.users
 * creates + links the public.users profile, mirroring what the Auth Admin API
 * does. Passwords are set with crypt() (pgcrypto, bcrypt-compatible with
 * Supabase GoTrue's `encrypted_password` column).
 *
 * Only implements the surface the seed scripts need:
 *   - admin.auth.admin.createUser / listUsers / deleteUser / updateUserById
 *   - admin.from('table').insert / update / delete / select / eq / neq / ilike / maybeSingle
 */
import crypto from 'node:crypto'
import pg from 'pg'
import { assertLocalDatabaseTargets } from './localOnlyGuard.js'

type Where = { col: string; op: string; value: unknown }

type DbResult = { error: { message: string } | null }

function toErr(e: unknown): { message: string } {
  const err = e as { message?: string }
  return { message: String(err?.message ?? e) }
}

/** pg.query throws on error — but normalize anyway for the union type. */
async function pq<T extends pg.QueryResultRow>(
  pool: pg.Pool,
  sql: string,
  values: unknown[],
): Promise<pg.QueryResult<T>> {
  try {
    return await pool.query<T>(sql, values)
  } catch (e) {
    const err = e as { message?: string }
    const wrapped = new Error(String(err?.message ?? e)) as Error & { __db: true }
    ;(wrapped as unknown as { __dbError: boolean }).__dbError = true
    throw wrapped
  }
}

function dbErr(e: unknown): { message: string } {
  const err = e as { message?: string }
  return { message: String(err?.message ?? e) }
}

class DirectQuery {
  private table: string
  private pool: pg.Pool
  private wheres: Where[] = []
  private selectCols = '*'
  private static jsonCols = new Map<string, Set<string>>()

  constructor(pool: pg.Pool, table: string) {
    this.pool = pool
    this.table = table
  }

  /** Column names whose data_type is json/jsonb — node-postgres passes JS
   *  objects as text without a type, so these need an explicit ::jsonb cast. */
  private async jsonColumns(): Promise<Set<string>> {
    const cached = DirectQuery.jsonCols.get(this.table)
    if (cached) return cached
    const res = await pq<{ column_name: string }>(
      this.pool,
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
         AND data_type IN ('json','jsonb')`,
      [this.table],
    )
    const set = new Set(res.rows.map((r) => r.column_name))
    DirectQuery.jsonCols.set(this.table, set)
    return set
  }

  /** All builder methods (select/insert/update/delete/filters) return this,
   *  so supabase-js-style chaining like .update().eq() keeps working. */
  private self(): this {
    return this
  }

  select(cols = '*') {
    this.selectCols = cols
    return this.self()
  }

  eq(col: string, value: unknown) { this.wheres.push({ col, op: '=', value }); return this.self() }
  neq(col: string, value: unknown) { this.wheres.push({ col, op: '<>', value }); return this.self() }
  ilike(col: string, value: string) { this.wheres.push({ col, op: 'ILIKE', value }); return this.self() }

  private whereParts(offset: number): { sql: string; values: unknown[] } {
    const values = this.wheres.map((w) => w.value)
    if (!this.wheres.length) return { sql: '', values }
    const parts = this.wheres.map((w, i) => `${w.col} ${w.op} $${offset + i + 1}`)
    return { sql: ` WHERE ${parts.join(' AND ')}`, values }
  }

  async maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
    const { sql, values } = this.whereParts(0)
    try {
      const res = await pq<Record<string, unknown>>(this.pool, `SELECT ${this.selectCols} FROM ${this.table}${sql} LIMIT 1`, values)
      return { data: (res.rows as Record<string, unknown>[])[0] ?? null, error: null }
    } catch (e) {
      return { data: null, error: dbErr(e) }
    }
  }

  async insert(payload: Record<string, unknown> | Record<string, unknown>[]): Promise<DbResult & { data?: unknown }> {
    const rows = Array.isArray(payload) ? payload : [payload]
    if (!rows.length) return { error: null, data: [] }
    try {
      const jsonCols = await this.jsonColumns()
      for (const row of rows) {
        const cols = Object.keys(row)
        const vals = Object.values(row).map((v, i) =>
          v !== null && typeof v === 'object' && jsonCols.has(cols[i]) ? JSON.stringify(v) : v,
        )
        const colSql = cols.join(', ')
        const phSql = cols.map((_, i) => `$${i + 1}`).join(', ')
        await pq(this.pool, `INSERT INTO ${this.table} (${colSql}) VALUES (${phSql})`, vals)
      }
      return { error: null, data: rows }
    } catch (e) {
      return { error: dbErr(e) }
    }
  }

  update(payload: Record<string, unknown>): DirectQuery & Promise<DbResult> {
    // supabase-js chains filters AFTER update() (.update(...).eq(...)), so SQL
    // must be built at await-time, not eagerly here.
    const thenable = this as unknown as DirectQuery & Promise<DbResult>
    const exec = async (): Promise<DbResult> => {
      try {
        const cols = Object.keys(payload)
        const jsonCols = await this.jsonColumns()
        const vals = Object.values(payload).map((v, i) =>
          v !== null && typeof v === 'object' && jsonCols.has(cols[i]) ? JSON.stringify(v) : v,
        )
        const setSql = cols.map((c, i) => `${c} = $${i + 1}`).join(', ')
        const { sql, values } = this.whereParts(vals.length)
        await pq(this.pool, `UPDATE ${this.table} SET ${setSql}${sql}`, [...vals, ...values])
        return { error: null }
      } catch (e) {
        return { error: dbErr(e) }
      }
    }
    // Make the returned object awaitable while still exposing .eq/.neq/.ilike
    // so supabase-js chains like .update(...).eq(...) work.
    Object.defineProperty(thenable, 'then', {
      writable: true,
      configurable: true,
      value: (resolve: (v: DbResult) => void, reject: (e: unknown) => void) => exec().then(resolve, reject),
    })
    return thenable
  }

  delete(): DirectQuery & Promise<DbResult> {
    const thenable = this as unknown as DirectQuery & Promise<DbResult>
    const exec = async (): Promise<DbResult> => {
      try {
        const { sql, values } = this.whereParts(0)
        await pq(this.pool, `DELETE FROM ${this.table}${sql}`, values)
        return { error: null }
      } catch (e) {
        return { error: dbErr(e) }
      }
    }
    Object.defineProperty(thenable, 'then', {
      writable: true,
      configurable: true,
      value: (resolve: (v: DbResult) => void, reject: (e: unknown) => void) => exec().then(resolve, reject),
    })
    return thenable
  }
}

const AUTH_INSTANCE_ID = '00000000-0000-0000-0000-000000000000'

/**
 * GoTrue will 500 on /token if auth.users is missing identities / app metadata.
 * Keep this insert aligned with Auth Admin API createUser(email_confirm: true).
 */
async function insertGoTrueUser(
  pool: pg.Pool,
  input: {
    id: string
    email: string
    password: string
    userMetadata: Record<string, unknown>
    emailConfirm: boolean
  },
): Promise<void> {
  const email = input.email.trim().toLowerCase()
  const confirmedSql = input.emailConfirm ? 'NOW()' : 'NULL'
  const params = [input.id, AUTH_INSTANCE_ID, email, input.password, JSON.stringify(input.userMetadata)]
  try {
    await pq(
      pool,
      `INSERT INTO auth.users (
         id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, confirmation_token, recovery_token,
         email_change_token_new, email_change,
         raw_app_meta_data, raw_user_meta_data, is_sso_user,
         created_at, updated_at
       ) VALUES (
         $1, $2::uuid, 'authenticated', 'authenticated', $3,
         crypt($4, gen_salt('bf', 10)),
         ${confirmedSql}, '', '', '', '',
         '{"provider":"email","providers":["email"]}'::jsonb,
         $5::jsonb, false,
         NOW(), NOW()
       )`,
      params,
    )
  } catch {
    await pq(
      pool,
      `INSERT INTO auth.users (
         id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at
       ) VALUES (
         $1, $2::uuid, 'authenticated', 'authenticated', $3,
         crypt($4, gen_salt('bf', 10)),
         ${confirmedSql},
         '{"provider":"email","providers":["email"]}'::jsonb,
         $5::jsonb,
         NOW(), NOW()
       )`,
      params,
    )
  }
  await ensureGoTrueIdentity(pool, input.id, email)
}

async function ensureGoTrueIdentity(pool: pg.Pool, userId: string, email: string): Promise<void> {
  const identityId = crypto.randomUUID()
  const identityData = JSON.stringify({
    sub: userId,
    email,
    email_verified: true,
    phone_verified: false,
  })
  try {
    await pq(
      pool,
      `INSERT INTO auth.identities (
         id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
       )
       SELECT $1::uuid, $2::uuid, $3::jsonb, 'email', $4, NOW(), NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM auth.identities WHERE user_id = $2::uuid AND provider = 'email'
       )`,
      [identityId, userId, identityData, email],
    )
  } catch {
    await pq(
      pool,
      `INSERT INTO auth.identities (
         id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
       )
       SELECT $1::uuid, $2::uuid, $3::jsonb, 'email', NOW(), NOW(), NOW()
       WHERE NOT EXISTS (
         SELECT 1 FROM auth.identities WHERE user_id = $2::uuid AND provider = 'email'
       )`,
      [identityId, userId, identityData],
    )
  }
}

export class DirectAdminClient {
  private pool: pg.Pool
  private password: string

  constructor(pool: pg.Pool, demoPassword = '') {
    this.pool = pool
    this.password = demoPassword
  }

  get auth() {
    const pool = this.pool
    const password = this.password
    return {
      admin: {
        async createUser(input: {
          email: string
          password?: string
          email_confirm?: boolean
          user_metadata?: Record<string, unknown>
        }) {
          const meta = input.user_metadata ?? {}
          const id = crypto.randomUUID()
          const pw = input.password ?? password
          if (!pw) {
            return {
              data: { user: null },
              error: { message: 'Seed user password is missing. Set SEED_USER_PASSWORD.' },
            }
          }
          const email = input.email.trim().toLowerCase()
          try {
            await insertGoTrueUser(pool, {
              id,
              email,
              password: pw,
              userMetadata: meta,
              emailConfirm: input.email_confirm !== false,
            })
          } catch (e) {
            return { data: { user: null }, error: dbErr(e) }
          }
          return { data: { user: { id, email } }, error: null }
        },

        async listUsers(opts: { page?: number; perPage?: number }) {
          const perPage = opts.perPage ?? 200
          const page = Math.max(opts.page ?? 1, 1)
          const offset = (page - 1) * perPage
          try {
            const res = await pq<{ id: string; email: string; raw_user_meta_data: Record<string, unknown> | null }>(
              pool,
              `SELECT id, email, raw_user_meta_data FROM auth.users ORDER BY created_at LIMIT $1 OFFSET $2`,
              [perPage, offset],
            )
            return {
              data: {
                users: res.rows.map((r) => ({
                  id: r.id,
                  email: r.email,
                  user_metadata: r.raw_user_meta_data ?? {},
                })),
              },
              error: null,
            }
          } catch (e) {
            return { data: { users: [] as unknown[] }, error: dbErr(e) }
          }
        },

        async deleteUser(id: string) {
          try {
            await pq(pool, `DELETE FROM auth.users WHERE id = $1`, [id])
            return { error: null }
          } catch (e) {
            return { error: dbErr(e) }
          }
        },

        async updateUserById(id: string, patch: { password?: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> }) {
          try {
            if (patch.password) {
              await pq(
                pool,
                `UPDATE auth.users SET encrypted_password = crypt($2, gen_salt('bf', 10)), updated_at = NOW() WHERE id = $1`,
                [id, patch.password],
              )
            }
            if (patch.email_confirm) {
              await pq(
                pool,
                `UPDATE auth.users SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()), updated_at = NOW() WHERE id = $1`,
                [id],
              )
            }
            if (patch.user_metadata) {
              await pq(
                pool,
                `UPDATE auth.users SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || $2::jsonb, updated_at = NOW() WHERE id = $1`,
                [id, JSON.stringify(patch.user_metadata)],
              )
            }
            await pq(
              pool,
              `UPDATE auth.users
               SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                     || '{"provider":"email","providers":["email"]}'::jsonb,
                   confirmation_token = COALESCE(confirmation_token, ''),
                   recovery_token = COALESCE(recovery_token, ''),
                   email_change = COALESCE(email_change, ''),
                   email_change_token_new = COALESCE(email_change_token_new, ''),
                   updated_at = NOW()
               WHERE id = $1`,
              [id],
            )
            const emailRow = await pq<{ email: string }>(pool, `SELECT email FROM auth.users WHERE id = $1`, [id])
            const email = emailRow.rows[0]?.email
            if (email) await ensureGoTrueIdentity(pool, id, email)
          } catch (e) {
            return { error: dbErr(e) }
          }
          return { error: null }
        },
      },
    }
  }

  from(table: string) {
    return new DirectQuery(this.pool, table)
  }

  /**
   * Patch existing GoTrue rows that were seeded without identities (token HTTP 500).
   * Repairs identities and confirmation only. It does not set a password.
   */
  async repairAuthUsers(): Promise<{ repaired: number }> {
    const connectionString = this.pool.options.connectionString
    assertLocalDatabaseTargets([
      {
        label: 'database URL',
        url: typeof connectionString === 'string' ? connectionString : undefined,
      },
    ])
    const res = await pq<{ id: string; email: string }>(
      this.pool,
      `SELECT id::text AS id, email FROM auth.users WHERE email IS NOT NULL`,
      [],
    )
    let repaired = 0
    for (const row of res.rows) {
      await this.auth.admin.updateUserById(row.id, {
        email_confirm: true,
      })
      repaired += 1
    }
    return { repaired }
  }
}
