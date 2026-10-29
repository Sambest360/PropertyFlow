import { describe, expect, it } from 'vitest'
import {
  connectionStringForPool,
  isRemoteDatabaseUrl,
  poolMaxFromEnv,
  resolveDatabaseUrl,
} from './dbConfig'

describe('isRemoteDatabaseUrl', () => {
  it('treats local URLs without ssl as local', () => {
    expect(isRemoteDatabaseUrl('postgresql://user@127.0.0.1:5432/propertyflow', undefined)).toBe(false)
  })

  it('treats sslmode query or DATABASE_SSL=1 as remote', () => {
    expect(isRemoteDatabaseUrl('postgresql://user@127.0.0.1:5432/db?sslmode=require', undefined)).toBe(true)
    expect(isRemoteDatabaseUrl('postgresql://user@127.0.0.1:5432/db', '1')).toBe(true)
  })
})

describe('connectionStringForPool', () => {
  it('leaves local URLs unchanged', () => {
    const url = 'postgresql://user@127.0.0.1:5432/propertyflow'
    expect(connectionStringForPool(url, false)).toBe(url)
  })

  it('forces libpq-compat require for remote URLs', () => {
    const parsed = new URL(connectionStringForPool('postgresql://u:p@db.example.com:5432/pf?sslmode=verify-full', true))
    expect(parsed.searchParams.get('sslmode')).toBe('require')
    expect(parsed.searchParams.get('uselibpqcompat')).toBe('true')
    expect(parsed.searchParams.get('connect_timeout')).toBe('5')
  })

  it('returns the raw string when URL parsing fails', () => {
    expect(connectionStringForPool('not-a-url', true)).toBe('not-a-url')
  })
})

describe('poolMaxFromEnv', () => {
  it('defaults to 10 and honours DB_POOL_MAX', () => {
    expect(poolMaxFromEnv(undefined)).toBe(10)
    expect(poolMaxFromEnv('4')).toBe(4)
    expect(poolMaxFromEnv('nope')).toBe(10)
  })
})

describe('resolveDatabaseUrl', () => {
  it('uses DATABASE_URL when set', () => {
    expect(resolveDatabaseUrl({ envUrl: ' postgresql://a@h/db ' })).toEqual({ url: 'postgresql://a@h/db', configured: true })
  })

  it('falls back to the local database', () => {
    expect(resolveDatabaseUrl({}).url).toBe('postgresql://127.0.0.1:5432/propertyflow')
  })
})
