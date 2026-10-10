import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import pg from 'pg'
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  connectionStringForPool,
  connectionTimeoutMsForRuntime,
  databaseUrlRuntimeWarning,
  isRemoteDatabaseUrl,
  poolMaxForRuntime,
  resolveDatabaseUrl,
} from './dbConfig.js'

// Local only — Vercel injects env vars; loading .env.local there is a no-op / noise.
if (!process.env.VERCEL) {
  loadEnv({ path: resolve(process.cwd(), '.env.local') })
  loadEnv({ path: resolve(process.cwd(), '.env') })
}

const { Pool } = pg

const resolved = resolveDatabaseUrl({
  envUrl: process.env.DATABASE_URL,
  vercel: process.env.VERCEL,
  lambda: process.env.AWS_LAMBDA_FUNCTION_NAME,
  localFallback: undefined,
})

export const databaseConfigured = resolved.configured
export const databaseConfigError = resolved.error
export const databaseConfigWarning =
  resolved.configured && (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
    ? databaseUrlRuntimeWarning(resolved.url)
    : undefined

const isRemote = resolved.configured && isRemoteDatabaseUrl(resolved.url)
const DATABASE_URL = resolved.configured
  ? connectionStringForPool(resolved.url, isRemote)
  : resolved.url
const poolMax = poolMaxForRuntime({
  vercel: process.env.VERCEL,
  lambda: process.env.AWS_LAMBDA_FUNCTION_NAME,
})
const connectionTimeoutMillis = connectionTimeoutMsForRuntime({
  vercel: process.env.VERCEL,
  lambda: process.env.AWS_LAMBDA_FUNCTION_NAME,
})

export const pool = resolved.configured
  ? new Pool({
      connectionString: DATABASE_URL,
      max: poolMax,
      // Keep idle clients from pinning transaction-mode pooler sessions.
      allowExitOnIdle: true,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis,
      // Cap long queries so bootstrap cannot eat the whole function budget.
      options: '-c statement_timeout=20000',
      ssl: isRemote ? { rejectUnauthorized: false } : undefined,
    })
  : null

function requirePool(): pg.Pool {
  if (!pool) {
    const err = new Error(databaseConfigError || 'DATABASE_URL is not configured') as Error & {
      status: number
    }
    err.status = 503
    throw err
  }
  return pool
}

/**
 * CR10 N3: one real transaction per request when the caller opens one.
 * Inside withTransaction, query() and nested withTransaction() calls run on
 * the same client, so the sign stamp and the main upsert commit or roll back
 * together. afterCommit() hooks run only after the outer COMMIT.
 */
type TxContext = { client: pg.PoolClient; afterCommit: Array<() => unknown>; closed: boolean }
const txStore = new AsyncLocalStorage<TxContext>()

/** Run fn after the outer transaction commits (immediately when not in one). Never on rollback. */
export function afterCommit(fn: () => unknown): void {
  const ctx = txStore.getStore()
  if (ctx && !ctx.closed) ctx.afterCommit.push(fn)
  else void Promise.resolve().then(fn).catch(() => undefined)
}

export function inTransaction(): boolean {
  return Boolean(txStore.getStore() && !txStore.getStore()!.closed)
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const ctx = txStore.getStore()
  if (ctx && !ctx.closed) return (await ctx.client.query<T>(text, params)).rows
  const result = await requirePool().query<T>(text, params)
  return result.rows
}

/** Fail fast when Postgres is slow or unreachable (serverless cold starts). */
export async function pingDatabase(timeoutMs = 4_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      query('SELECT 1 AS ok'),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('database ping timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const outer = txStore.getStore()
  if (outer && !outer.closed) return fn(outer.client) // nested: join the outer transaction
  const client = await requirePool().connect()
  const ctx: TxContext = { client, afterCommit: [], closed: false }
  try {
    await client.query('BEGIN')
    const result = await txStore.run(ctx, () => fn(client))
    await client.query('COMMIT')
    ctx.closed = true
    for (const hook of ctx.afterCommit) void Promise.resolve().then(hook).catch(() => undefined)
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore rollback errors */
    }
    throw err
  } finally {
    ctx.closed = true
    client.release()
  }
}

export async function clientQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  client: pg.PoolClient,
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await client.query<T>(text, params)
  return result.rows
}
