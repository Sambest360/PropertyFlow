/**
 * Verify a Supabase Auth access token locally.
 * Signature comes from SUPABASE_JWKS_URL (ES256/RS256) or SUPABASE_JWT_SECRET (HS256).
 * exp, aud, and iss are required. The subject must be a UUID. Claims such as
 * user_metadata are ignored — callers load role and agency from public.users.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type SupabaseAccessToken = {
  sub: string
}

type RemoteJwks = ReturnType<typeof createRemoteJWKSet>
const jwksByUrl = new Map<string, RemoteJwks>()

export function expectedJwtIssuer(): string | null {
  const explicit = process.env.SUPABASE_JWT_ISS?.trim()
  if (explicit) return explicit
  const base = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).replace(/\/$/, '')
  if (!base) return null
  return `${base}/auth/v1`
}

export function expectedJwtAudience(): string {
  return process.env.SUPABASE_JWT_AUD?.trim() || 'authenticated'
}

export function resetJwtKeyCacheForTests(): void {
  jwksByUrl.clear()
}

function tokenAlg(token: string): string | null {
  const part = token.split('.')[0]
  if (!part) return null
  try {
    const json = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { alg?: unknown }
    return typeof json.alg === 'string' ? json.alg : null
  } catch {
    return null
  }
}

function jwksFor(url: string): RemoteJwks {
  let set = jwksByUrl.get(url)
  if (!set) {
    set = createRemoteJWKSet(new URL(url))
    jwksByUrl.set(url, set)
  }
  return set
}

/** Returns the auth user id, or null when the token is missing a valid signature or claim. */
export async function verifySupabaseAccessToken(token: string): Promise<SupabaseAccessToken | null> {
  const alg = tokenAlg(token)
  if (!alg || alg === 'none') return null
  const issuer = expectedJwtIssuer()
  if (!issuer) return null
  const audience = expectedJwtAudience()

  try {
    let payload: JWTPayload
    if (alg === 'HS256') {
      const secret = process.env.SUPABASE_JWT_SECRET?.trim()
      if (!secret) return null
      const verified = await jwtVerify(token, new TextEncoder().encode(secret), {
        algorithms: ['HS256'],
        issuer,
        audience,
        clockTolerance: 0,
      })
      payload = verified.payload
    } else if (alg === 'ES256' || alg === 'RS256') {
      const jwksUrl = process.env.SUPABASE_JWKS_URL?.trim()
      if (!jwksUrl) return null
      const verified = await jwtVerify(token, jwksFor(jwksUrl), {
        algorithms: [alg],
        issuer,
        audience,
        clockTolerance: 0,
      })
      payload = verified.payload
    } else {
      return null
    }
    if (payload.exp == null) return null
    if (typeof payload.sub !== 'string' || !UUID_RE.test(payload.sub)) return null
    return { sub: payload.sub }
  } catch {
    return null
  }
}
