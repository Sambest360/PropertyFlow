import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  connectionStringForPool,
  connectionTimeoutMsForRuntime,
  isRemoteDatabaseUrl,
  poolConfigForDatabaseUrl,
  poolMaxForRuntime,
  resolveDatabaseUrl,
} from './dbConfig'

const require = createRequire(import.meta.url)
const ConnectionParameters = require('pg/lib/connection-parameters') as new (
  config: Record<string, unknown>,
) => {
  ssl?: false | { rejectUnauthorized?: boolean; checkServerIdentity?: () => void }
  host?: string
}

describe('isRemoteDatabaseUrl', () => {
  it('treats local URLs without ssl as local', () => {
    expect(
      isRemoteDatabaseUrl('postgresql://user@127.0.0.1:5432/propertyflow'),
    ).toBe(false)
  })

  it('treats Supabase hostnames as remote', () => {
    expect(
      isRemoteDatabaseUrl(
        'postgresql://postgres.abc@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
      ),
    ).toBe(true)
    expect(
      isRemoteDatabaseUrl('postgresql://x@db.abc.supabase.co:5432/postgres'),
    ).toBe(true)
  })

  it('treats any non-localhost host as remote, even without sslmode', () => {
    expect(isRemoteDatabaseUrl('postgresql://user@db.example.com:5432/app')).toBe(true)
  })

  it('keeps localhost local even when sslmode or a TLS env flag is present', () => {
    expect(
      isRemoteDatabaseUrl('postgresql://user@127.0.0.1:5432/db?sslmode=require'),
    ).toBe(false)
    expect(isRemoteDatabaseUrl('postgresql://user@localhost:5432/db')).toBe(false)
    expect(isRemoteDatabaseUrl('postgresql://user@LOCALHOST:5432/db')).toBe(false)
    expect(isRemoteDatabaseUrl('postgresql://user@[::1]:5432/db')).toBe(false)
  })
})

describe('connectionStringForPool', () => {
  it('leaves local URLs unchanged', () => {
    const url = 'postgresql://user@127.0.0.1:5432/propertyflow'
    expect(connectionStringForPool(url, false)).toBe(url)
  })

  it('forces verify-full and strips libpq-compat for remote URLs', () => {
    const out = connectionStringForPool(
      'postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true',
      true,
    )
    const parsed = new URL(out)
    expect(parsed.searchParams.get('sslmode')).toBe('verify-full')
    expect(parsed.searchParams.has('uselibpqcompat')).toBe(false)
    expect(parsed.searchParams.get('connect_timeout')).toBe('5')
    expect(parsed.searchParams.get('pgbouncer')).toBe('true')
  })

  it('appends sslrootcert when a CA path is provided', () => {
    const out = connectionStringForPool(
      'postgresql://u:p@db.example.com:5432/app',
      true,
      '/etc/ssl/db-ca.pem',
    )
    expect(new URL(out).searchParams.get('sslrootcert')).toBe('/etc/ssl/db-ca.pem')
    expect(new URL(out).searchParams.get('sslmode')).toBe('verify-full')
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
    expect(r.error).toMatch(/pooled Postgres URL/)
    expect(r.error).not.toMatch(/Supabase/)
  })

  it('rejects localhost URLs on Vercel', () => {
    const r = resolveDatabaseUrl({
      vercel: '1',
      envUrl: 'postgresql://u@127.0.0.1:5432/db',
    })
    expect(r.configured).toBe(false)
    expect(r.error).toMatch(/localhost/)
    expect(r.error).toMatch(/pooled Postgres URL/)
    expect(r.error).not.toMatch(/Supabase/)
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

const WEAK_SSLMODES = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'no-verify'] as const

describe('pool TLS verification', () => {
  it('resolves a non-localhost URL to verify-full with certificate checks on', () => {
    const input =
      'postgresql://u:p@db.example.com:5432/app?sslmode=require&uselibpqcompat=true&ssl=no-verify'
    const cfg = poolConfigForDatabaseUrl(input)
    const parsed = new URL(cfg.connectionString)

    expect(cfg.connectionString.toLowerCase()).not.toContain('uselibpqcompat')
    expect(parsed.searchParams.get('sslmode')).toBe('verify-full')
    for (const mode of WEAK_SSLMODES) {
      expect(parsed.searchParams.get('sslmode')).not.toBe(mode)
    }
    expect(parsed.searchParams.get('ssl')).not.toBe('no-verify')
    expect(cfg.ssl?.rejectUnauthorized).not.toBe(false)

    // Same merge pg's ConnectionParameters uses: the URL overwrites `ssl`.
    const resolved = new ConnectionParameters({
      connectionString: cfg.connectionString,
      ssl: cfg.ssl,
    })
    expect(resolved.host).toBe('db.example.com')
    expect(resolved.ssl).not.toBe(false)
    expect(typeof resolved.ssl).toBe('object')
    expect(resolved.ssl && resolved.ssl.rejectUnauthorized).not.toBe(false)
    expect(resolved.ssl && resolved.ssl.checkServerIdentity).toBeUndefined()
  })

  it('upgrades every weaker sslmode on a remote host', () => {
    for (const mode of WEAK_SSLMODES) {
      const cfg = poolConfigForDatabaseUrl(
        `postgresql://u:p@db.example.com/app?sslmode=${mode}&UseLibpqCompat=true`,
      )
      const parsed = new URL(cfg.connectionString)
      expect(parsed.searchParams.get('sslmode')).toBe('verify-full')
      expect(parsed.searchParams.has('uselibpqcompat')).toBe(false)
      expect(parsed.searchParams.has('UseLibpqCompat')).toBe(false)
      expect(cfg.ssl?.rejectUnauthorized).toBe(true)
    }
  })

  it('leaves a localhost URL without TLS', () => {
    for (const url of [
      'postgresql://user@127.0.0.1:5432/propertyflow',
      'postgresql://user@localhost:5432/propertyflow',
      'postgresql://user@[::1]:5432/propertyflow',
    ]) {
      const cfg = poolConfigForDatabaseUrl(url)
      expect(cfg.connectionString).toBe(url)
      expect(cfg.ssl).toBeUndefined()
      expect(cfg.connectionString).not.toContain('sslmode')
    }
  })
})