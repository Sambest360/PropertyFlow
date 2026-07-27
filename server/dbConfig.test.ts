import { describe, expect, it } from 'vitest'
import {
  connectionStringForPool,
  isRemoteDatabaseUrl,
  poolMaxForRuntime,
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

  it('forces libpq-compat require for remote URLs', () => {
    const out = connectionStringForPool(
      'postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=verify-full',
      true,
    )
    const parsed = new URL(out)
    expect(parsed.searchParams.get('sslmode')).toBe('require')
    expect(parsed.searchParams.get('uselibpqcompat')).toBe('true')
  })

  it('returns the raw string when URL parsing fails', () => {
    expect(connectionStringForPool('not-a-url', true)).toBe('not-a-url')
  })
})

describe('poolMaxForRuntime', () => {
  it('uses a tiny pool on Vercel or Lambda', () => {
    expect(poolMaxForRuntime({ vercel: '1' })).toBe(2)
    expect(poolMaxForRuntime({ lambda: 'fn' })).toBe(2)
  })

  it('uses a larger pool for local Node', () => {
    expect(poolMaxForRuntime({})).toBe(8)
  })
})
