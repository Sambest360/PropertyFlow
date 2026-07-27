import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import pg from 'pg'
import {
  connectionStringForPool,
  isRemoteDatabaseUrl,
  poolMaxForRuntime,
} from './dbConfig.js'

loadEnv({ path: resolve(process.cwd(), '.env.local') })
loadEnv({ path: resolve(process.cwd(), '.env') })

const { Pool } = pg

const rawUrl =
  process.env.DATABASE_URL ||
  'postgresql://samuelkorantengamoahbampo@127.0.0.1:5432/propertyflow'

const isRemote = isRemoteDatabaseUrl(rawUrl)
const DATABASE_URL = connectionStringForPool(rawUrl, isRemote)
const poolMax = poolMaxForRuntime({
  vercel: process.env.VERCEL,
  lambda: process.env.AWS_LAMBDA_FUNCTION_NAME,
})

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: poolMax,
  // Keep idle clients from pinning transaction-mode pooler sessions.
  allowExitOnIdle: true,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
  ssl: isRemote ? { rejectUnauthorized: false } : undefined,
})

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query<T>(text, params)
  return result.rows
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore rollback errors */
    }
    throw err
  } finally {
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
