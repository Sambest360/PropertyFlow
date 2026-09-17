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

export class DirectAdminClient {
  private pool: pg.Pool
  private password: string

  constructor(pool: pg.Pool, demoPassword: string) {
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
          try {
            await pq(
              pool,
              `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role, created_at, updated_at)
               VALUES ($1, lower($2), crypt($3, gen_salt('bf', 10)), NOW(), $4::jsonb, 'authenticated', 'authenticated', NOW(), NOW())`,
              [id, input.email, pw, JSON.stringify(meta)],
            )
          } catch (e) {
            return { data: { user: null }, error: dbErr(e) }
          }
          return { data: { user: { id, email: input.email } }, error: null }
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
          if (patch.password) {
            try {
              await pq(
                pool,
                `UPDATE auth.users SET encrypted_password = crypt($2, gen_salt('bf', 10)), updated_at = NOW() WHERE id = $1`,
                [id, patch.password],
              )
            } catch (e) {
              return { error: dbErr(e) }
            }
          }
          if (patch.user_metadata) {
            try {
              await pq(
                pool,
                `UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data || $2::jsonb, updated_at = NOW() WHERE id = $1`,
                [id, JSON.stringify(patch.user_metadata)],
              )
            } catch (e) {
              return { error: dbErr(e) }
            }
          }
          return { error: null }
        },
      },
    }
  }

  from(table: string) {
    return new DirectQuery(this.pool, table)
  }
}
