/**
 * Pure helpers for Postgres pool configuration (unit-testable).
 * Used by server/db.ts when creating the pg Pool.
 */

export function isRemoteDatabaseUrl(
    url: string,
    sslEnv: string | undefined = process.env.DATABASE_SSL,
  ): boolean {
    return (
      /supabase\.(co|com)/i.test(url) ||
      /pooler\.supabase\.com/i.test(url) ||
      /sslmode=/i.test(url) ||
      sslEnv === '1'
    )
  }
  
  /**
   * Newer `pg` treats sslmode=require as verify-full. For Supabase pooler we need
   * libpq-compat require + rejectUnauthorized false (managed CA chain).
   */
  export function connectionStringForPool(url: string, remote: boolean): string {
    if (!remote) return url
    try {
      const u = new URL(url)
      u.searchParams.delete('sslmode')
      u.searchParams.set('sslmode', 'require')
      u.searchParams.set('uselibpqcompat', 'true')
      return u.toString()
    } catch {
      return url
    }
  }
  
  /** Serverless (Vercel / Lambda) should use a tiny pool; local Node can use more. */
  export function poolMaxForRuntime(opts: {
    vercel?: string | undefined
    lambda?: string | undefined
  }): number {
    return opts.vercel || opts.lambda ? 2 : 8
  }
  