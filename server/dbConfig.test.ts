import { describe, expect, it } from 'vitest'
import {
  connectionStringForPool,
  connectionTimeoutMsForRuntime,
  databaseSslOptions,
  isRemoteDatabaseUrl,
  poolMaxForRuntime,
  readDatabaseCaPem,
  resolveDatabaseUrl,
} from './dbConfig'

describe('isRemoteDatabaseUrl', () => {
  it('treats local URLs without ssl as local', () => {
    expect(
      isRemoteDatabaseUrl('postgresql://user@127.0.0.1:5432/propertyflow', undefined),
    ).toBe(false)
  })

  it('treats Supabase hostnames as remote', () => {
    expect(
      isRemoteDatabaseUrl(
        'postgresql://postgres.abc@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
        undefined,
      ),
    ).toBe(true)
    expect(
      isRemoteDatabaseUrl('postgresql://x@db.abc.supabase.co:5432/postgres', undefined),
    ).toBe(true)
  })

  it('treats sslmode query or DATABASE_SSL=1 as remote', () => {
    expect(
      isRemoteDatabaseUrl('postgresql://user@127.0.0.1:5432/db?sslmode=require', undefined),
    ).toBe(true)
    expect(
      isRemoteDatabaseUrl('postgresql://user@127.0.0.1:5432/db', '1'),
    ).toBe(true)
  })
})

describe('connectionStringForPool', () => {
  it('leaves local URLs unchanged', () => {
    const url = 'postgresql://user@127.0.0.1:5432/propertyflow'
    expect(connectionStringForPool(url, false)).toBe(url)
  })

  it('strips sslmode so Pool.ssl can verify the certificate', () => {
    const out = connectionStringForPool(
      'postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=verify-full&uselibpqcompat=true',
      true,
    )
    const parsed = new URL(out)
    expect(parsed.searchParams.get('sslmode')).toBeNull()
    expect(parsed.searchParams.get('uselibpqcompat')).toBeNull()
    expect(parsed.searchParams.get('connect_timeout')).toBe('5')
    expect(parsed.searchParams.get('pgbouncer')).toBe('true')
  })

  it('verifies TLS for remote hosts and allows plain connections only on localhost', () => {
    expect(databaseSslOptions('postgresql://u@127.0.0.1:5432/propertyflow')).toBeUndefined()
    expect(databaseSslOptions('postgresql://u@localhost:5432/propertyflow')).toBeUndefined()
    const remote = databaseSslOptions(
      'postgresql://u@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
    )
    expect(remote).toEqual({ rejectUnauthorized: true })
    const withCa = databaseSslOptions(
      'postgresql://u@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
      '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
    )
    expect(withCa?.rejectUnauthorized).toBe(true)
    expect(withCa?.ca).toMatch(/BEGIN CERTIFICATE/)
  })

  it('reads a PEM CA from env and rejects a missing file path', () => {
    const pem = '-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----'
    expect(readDatabaseCaPem(pem)).toBe(
      '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----',
    )
    expect(readDatabaseCaPem(undefined)).toBeUndefined()
    expect(() => readDatabaseCaPem('/no/such/propertyflow-ca.pem')).toThrow(/DATABASE_SSL_CA/)
  })

  it('returns the raw string when URL parsing fails', () => {
    expect(connectionStringForPool('not-a-url', true)).toBe('not-a-url')
  })
})

describe('poolMaxForRuntime', () => {
  it('uses a tiny pool on Vercel or Lambda', () => {
    expect(poolMaxForRuntime({ vercel: '1' })).toBe(1)
    expect(poolMaxForRuntime({ lambda: 'fn' })).toBe(1)
  })

  it('uses a larger pool for local Node', () => {
    expect(poolMaxForRuntime({})).toBe(8)
  })
})

describe('connectionTimeoutMsForRuntime', () => {
  it('fails faster on serverless, tolerates pooler spikes locally', () => {
    expect(connectionTimeoutMsForRuntime({ vercel: '1' })).toBe(5_000)
    // Local dev: the Supabase transaction pooler routinely shows 5–7s connects;
    // a 3s timeout wedged the whole dev API (observed 2026-09-19).
    expect(connectionTimeoutMsForRuntime({})).toBe(10_000)
  })
})

describe('resolveDatabaseUrl', () => {
  it('requires DATABASE_URL on Vercel', () => {
    const r = resolveDatabaseUrl({ vercel: '1' })
    expect(r.configured).toBe(false)
    expect(r.error).toMatch(/DATABASE_URL/)
  })

  it('rejects localhost URLs on Vercel', () => {
    const r = resolveDatabaseUrl({
      vercel: '1',
      envUrl: 'postgresql://u@127.0.0.1:5432/db',
    })
    expect(r.configured).toBe(false)
    expect(r.error).toMatch(/localhost/)
  })

  it('accepts a pooler URI', () => {
    const r = resolveDatabaseUrl({
      vercel: '1',
      envUrl:
        'postgresql://postgres.abc:pass@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
    })
    expect(r.configured).toBe(true)
  })

  it('uses the local fallback when DATABASE_URL is unset on a dev machine', () => {
    const r = resolveDatabaseUrl({
      localFallback: 'postgresql://dev@127.0.0.1:5432/propertyflow',
    })
    expect(r.configured).toBe(true)
    expect(r.url).toBe('postgresql://dev@127.0.0.1:5432/propertyflow')
  })
})